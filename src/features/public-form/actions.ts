"use server";

import { after } from "next/server";
import { and, count, eq, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  documents,
  people,
  ticketAttachments,
  ticketEvents,
  tickets,
} from "@/db/schema";
import { createDocumentDownloadUrl } from "@/features/documents/storage-objects";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  findDeletedPersonByPhone,
  findPersonByPhone,
  unitBelongsToBuilding,
} from "@/features/people/queries";
import { PHONE_UNIQUE_CONSTRAINT } from "@/features/people/constraints";
import { sendUrgentTicketAlertEmail } from "@/features/notifications/email/send-urgent-ticket-alert-email";
import { insertNotification } from "@/features/notifications/create-notification";
import {
  buildNewTicketNotification,
  buildUrgentTicketNotification,
} from "@/features/notifications/notification-content";
import { detectAndFlagSimilarTickets } from "@/features/tickets/detect-similar-tickets-on-create";
import { embedAndStoreTicket } from "@/features/tickets/embeddings/embed-ticket";
import { getClientIp } from "@/lib/request-ip";
import { UNIQUE_VIOLATION, unwrapPostgresError } from "@/lib/postgres-errors";

import type { PublicBuilding, TicketCategory } from "./queries";
import {
  getBuildingByPublicToken,
  getCategoryForTicket,
  getResidentUpdateTicket,
  getTicketStatusByPublicCode,
} from "./queries";
import {
  isAttachmentUploadRateLimited,
  isResidentUpdateRateLimited,
  isStatusLookupRateLimited,
  isTicketSubmissionRateLimited,
  recordAttachmentUploadAttempt,
  recordResidentUpdateAttempt,
  recordStatusLookupAttempt,
  recordTicketSubmissionAttempt,
} from "./rate-limit";
import {
  MAX_RESIDENT_UPDATE_TEXT,
  residentUpdateTextSchema,
  type ResidentUpdateState,
} from "./resident-update-schema";
import {
  ticketStatusLookupSchema,
  type TicketStatusLookupState,
} from "./status-lookup-schema";
import { getExistingAttachmentPaths } from "./storage-objects";
import {
  ACCEPTED_ATTACHMENT_MIME_TYPES,
  createTicketInputSchema,
  MAX_TICKET_PHOTOS,
  TICKET_ATTACHMENTS_BUCKET,
  validateAttachmentSize,
  type CreateTicketOutput,
  type CreateTicketState,
} from "./ticket-schema";

// createTicketAction es pública a propósito -- misma excepción documentada
// que loginAction (ver CLAUDE.md > Autorización de rutas y Server Actions):
// no hay sesión que exigir acá, es el flujo central del producto entero
// (ver CLAUDE.md > Qué es este proyecto). Por eso NO usa authorizedAction()
// -- en su lugar, resuelve su propia "autorización" desde el `token` (la
// credencial real de este flujo, ver public-form/queries.ts), y valida
// cada dato contra la organización que ese token resuelve. Ver el análisis
// de seguridad completo en el reporte de este paso.
//
// CreateTicketState/initialCreateTicketState viven en ticket-schema.ts, NO
// acá -- mismo motivo que BulkPreviewState/initialBulkPreviewState en el
// paso 4.3 (ver el comentario de ese archivo): un archivo "use server" solo
// puede exportar funciones async, y initialCreateTicketState es un objeto.

// Deriva un título corto de la descripción -- el formulario público nunca
// pidió un campo de título aparte (paso 5.2: minimizar campos), pero
// tickets.title es NOT NULL (lo completa el administrador a mano en el
// origen "admin"; acá no hay quién lo tipee). Corta en el último espacio
// antes de 80 caracteres para no partir una palabra al medio; si no hay un
// espacio razonable (texto sin espacios, o muy corto), corta tal cual.
const TITLE_MAX_LENGTH = 80;
function deriveTicketTitle(description: string): string {
  const trimmed = description.trim();
  if (trimmed.length <= TITLE_MAX_LENGTH) {
    return trimmed;
  }
  const cut = trimmed.slice(0, TITLE_MAX_LENGTH);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > 40 ? cut.slice(0, lastSpace) : cut;
  return `${base.trimEnd()}…`;
}

type AttachmentToInsert = CreateTicketOutput["attachments"][number];

// Persona + ticket + adjuntos + evento, todo en una sola transacción. Se
// separó de createTicketAction para poder invocarla dos veces (intento
// original + el reintento acotado de más abajo) sin duplicar la lógica.
// Hace SIEMPRE su propia búsqueda de persona fresca -- no recibe
// activeMatch/deletedMatch por parámetro -- porque el reintento depende
// exactamente de eso: en la segunda vuelta, la persona que antes no existía
// ya fue creada por la transacción que ganó la carrera.
async function attemptCreateTicket(
  building: PublicBuilding,
  category: TicketCategory,
  attachmentsToInsert: AttachmentToInsert[],
  data: CreateTicketOutput,
): Promise<{ id: string; publicCode: string; attachmentsToken: string }> {
  const activeMatch = await findPersonByPhone(
    building.organizationId,
    data.phoneE164,
  );
  const deletedMatch = activeMatch
    ? null
    : await findDeletedPersonByPhone(building.organizationId, data.phoneE164);

  const ticketTitle = deriveTicketTitle(data.description);

  const ticket = await db.transaction(async (tx) => {
    let personId: string;

    if (activeMatch) {
      // Vecino ya conocido y activo: se reusa tal cual está guardado, sin
      // pisar su nombre con lo que haya tipeado esta vez -- cualquiera
      // que conozca (o adivine) un teléfono ajeno no puede reescribir el
      // nombre de otra persona con solo cargar un reclamo (ver el
      // análisis de seguridad del reporte, punto "datos inventados"). Esta
      // es también la rama que resuelve el reintento: la persona que la
      // otra transacción acaba de crear aparece acá como activeMatch.
      personId = activeMatch.id;
    } else if (deletedMatch) {
      // Resuelve el Pendiente anotado desde el paso 4.4 (ver CLAUDE.md >
      // Pendientes): opción 2, revivir la ficha anterior. Mismo criterio
      // que "no pisar el nombre" de arriba -- revivir NO actualiza
      // firstName/lastName con lo tipeado ahora, mantiene lo que ya
      // estaba guardado.
      const [revived] = await tx
        .update(people)
        .set({ deletedAt: null })
        .where(
          and(
            eq(people.id, deletedMatch.id),
            eq(people.organizationId, building.organizationId),
            isNotNull(people.deletedAt),
          ),
        )
        .returning({ id: people.id });
      if (!revived) {
        // Carrera extremadamente angosta: alguien más reactivó o
        // reemplazó esta ficha entre el chequeo de arriba y acá. No se
        // improvisa una resolución -- se aborta la transacción entera y
        // se le pide al vecino reintentar (mismo criterio que cualquier
        // otra carrera de este proyecto). A propósito NO tiene el mismo
        // reintento automático que PHONE_UNIQUE_CONSTRAINT: acá no hay
        // ninguna fila "ganadora" garantizada que un reintento pueda
        // reusar (quien reactivó pudo, en cambio, haber vuelto a borrar),
        // así que reintentar solo no alcanzaría -- ver el reporte.
        throw new Error("PERSON_REVIVE_RACE");
      }
      personId = revived.id;
    } else {
      const [inserted] = await tx
        .insert(people)
        .values({
          organizationId: building.organizationId,
          firstName: data.firstName,
          lastName: data.lastName,
          phoneE164: data.phoneE164,
        })
        .returning({ id: people.id });
      if (!inserted) {
        throw new Error("PERSON_CREATE_FAILED");
      }
      personId = inserted.id;
    }

    const [ticket] = await tx
      .insert(tickets)
      .values({
        organizationId: building.organizationId,
        buildingId: building.id,
        unitId: data.unitNotListed ? null : data.unitId,
        unitLabelRaw: data.unitNotListed ? data.unitLabelRaw : null,
        personId,
        categoryId: category.id,
        title: ticketTitle,
        description: data.description,
        // Sale de la categoría, no de un campo del formulario -- ver
        // CLAUDE.md > Fotos y adjuntos... no, ver el paso 5.2: "sin
        // prioridad en el formulario público".
        priority: category.defaultPriority,
        source: "public_form",
      })
      // El trigger set_ticket_public_code (migración 0007/0009) ya pone
      // public_code SIEMPRE, sin que esta acción tenga que calcular nada
      // -- .returning() lo trae de vuelta para poder mostrárselo al
      // vecino. attachments_token (paso 5.10) sale igual, de
      // defaultRandom() en la base -- ver src/db/schema/tickets.ts.
      // reportedAt (paso 7.2): la detección de posibles duplicados,
      // DESPUÉS de esta transacción, necesita el instante real que puso
      // defaultNow() -- no vale aproximarlo con `new Date()` del lado de
      // JS después del commit, por poco que difieran en la práctica.
      .returning({
        id: tickets.id,
        publicCode: tickets.publicCode,
        attachmentsToken: tickets.attachmentsToken,
        reportedAt: tickets.reportedAt,
      });
    if (!ticket) {
      throw new Error("TICKET_CREATE_FAILED");
    }

    if (attachmentsToInsert.length > 0) {
      await tx.insert(ticketAttachments).values(
        attachmentsToInsert.map((a) => ({
          organizationId: building.organizationId,
          ticketId: ticket.id,
          storagePath: a.path,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          originalFilename: a.originalFilename,
        })),
      );
    }

    await tx.insert(ticketEvents).values({
      organizationId: building.organizationId,
      ticketId: ticket.id,
      type: "created",
      actorType: "neighbor",
      actorLabel: [data.firstName, data.lastName].filter(Boolean).join(" "),
      payload: { source: "public_form" },
    });

    // Notificación para el panel (paso 9.4) -- DENTRO de esta misma
    // transacción, no después del commit como detectAndFlagSimilarTickets
    // más abajo: acá sí es correcto que un rollback (ej. la carrera de
    // teléfono, ver isPhoneRaceError) se lleve la notificación puesta con
    // el resto -- si el reintento de attemptCreateTicket vuelve a pasar
    // por acá, es porque este ticket nunca llegó a existir de verdad, así
    // que tampoco debería quedar una notificación apuntando a él.
    //
    // UNA sola notificación por reclamo, nunca dos: si la prioridad (que
    // sale de category.defaultPriority, no del formulario -- paso 5.2, "sin
    // prioridad en el formulario público") es "urgent", esta rama reemplaza
    // a la genérica en vez de sumarse a ella -- ver el comentario de
    // buildUrgentTicketNotification (notification-content.ts) para por qué
    // es un type de enum propio y no new_ticket con otro texto.
    const notificationContent =
      category.defaultPriority === "urgent"
        ? buildUrgentTicketNotification({
            ticketId: ticket.id,
            buildingName: building.name,
            ticketTitle,
          })
        : buildNewTicketNotification({
            ticketId: ticket.id,
            buildingName: building.name,
            ticketTitle,
          });
    await insertNotification(tx, {
      organizationId: building.organizationId,
      relatedTicketId: ticket.id,
      ...notificationContent,
    });

    return ticket;
  });

  // Embedding del reclamo (paso 14.2) + detección de posibles duplicados
  // (paso 7.2, ahora HÍBRIDA -- paso 14.4), las dos DESPUÉS del commit de
  // la transacción de arriba y las dos con `after()` de next/server, en
  // secuencia.
  //
  // Hasta el 14.3 la detección se `await`eaba acá (era solo una consulta
  // local de trigram, rápida). El 14.4 la hace híbrida: además del trigram
  // compara el EMBEDDING del reclamo nuevo contra los candidatos (coseno,
  // índice HNSW). Ese embedding es una llamada HTTP externa a Gemini con
  // hasta 3 reintentos y backoff (~1s/2s/4s) -- `await`earla sumaría
  // segundos a la espera del vecino. Por eso las dos pasan a `after()`:
  // primero `embedAndStoreTicket` guarda `tickets.embedding`, después
  // `detectAndFlagSimilarTickets` lo lee de la base y corre la comparación
  // híbrida. Si el embedding falla los 3 reintentos, la detección corre
  // igual (trigram solo -- el par se compara sin la capa semántica, que es
  // el comportamiento esperado) y el barrido diario reintenta el embedding;
  // NO se re-corre la detección para ese par (re-scorear pares históricos
  // es alcance del 14.5).
  //
  // Las dos funciones tienen su propio try/catch y NUNCA tiran (regla dura
  // del 7.2): una falla acá no puede hacer rollback de un ticket que el
  // vecino ya ve confirmado. `after()` corre el callback igual en dev
  // (proceso persistente) y en producción (Vercel lo sostiene con
  // waitUntil), a diferencia de una promesa suelta sin await, que en
  // serverless podría morir con la instancia.
  after(async () => {
    await embedAndStoreTicket({
      ticketId: ticket.id,
      organizationId: building.organizationId,
      categoryName: category.name,
      description: data.description,
    });
    await detectAndFlagSimilarTickets({
      organizationId: building.organizationId,
      ticketId: ticket.id,
      buildingId: building.id,
      categoryId: category.id,
      title: ticketTitle,
      description: data.description,
      reportedAt: ticket.reportedAt,
    });
  });

  // Alerta inmediata por email (paso 9.5, punto 4) -- mismo evento que ya
  // dispara la notificación `urgent_ticket` del centro de notificaciones
  // (paso 9.4), mismo lugar (después del commit, nunca adentro de la
  // transacción) y mismo motivo que detectAndFlagSimilarTickets arriba:
  // sendUrgentTicketAlertEmail() ya garantiza con su propio try/catch que
  // nunca tira (ver ese archivo) -- el alta del reclamo no puede depender
  // de que Resend responda.
  if (category.defaultPriority === "urgent") {
    await sendUrgentTicketAlertEmail({
      organizationId: building.organizationId,
      buildingName: building.name,
      ticketId: ticket.id,
      ticketTitle,
      ticketPublicCode: ticket.publicCode,
    });
  }

  return ticket;
}

// true si el error es EXACTAMENTE la carrera de teléfono (dos envíos casi
// simultáneos con el mismo teléfono nuevo, agarrados por el índice único
// parcial de people). Acotado a propósito a este único caso -- no a
// PERSON_REVIVE_RACE ni a ningún otro error -- porque es el único donde un
// reintento está matemáticamente garantizado de resolverse: Postgres recién
// le informa la violación de unicidad a la transacción perdedora DESPUÉS de
// que la transacción ganadora haya hecho commit (el insert perdedor queda
// bloqueado en el lock de la fila/índice hasta ese momento), así que para
// cuando este catch corre, la fila ganadora ya está commiteada y visible --
// el reintento la va a encontrar sí o sí vía findPersonByPhone().
function isPhoneRaceError(error: unknown): boolean {
  const pgError = unwrapPostgresError(error);
  return (
    pgError?.code === UNIQUE_VIOLATION &&
    pgError.constraint_name === PHONE_UNIQUE_CONSTRAINT
  );
}

function translateCreateTicketError(error: unknown): CreateTicketState {
  if (
    isPhoneRaceError(error) ||
    (error instanceof Error && error.message === "PERSON_REVIVE_RACE")
  ) {
    return {
      status: "error",
      message:
        "Hubo un problema al identificarte. Volvé a intentar en un momento.",
    };
  }
  return {
    status: "error",
    message: "No pudimos registrar tu reclamo. Probá de nuevo en un momento.",
  };
}

// El registro real de un reclamo (paso 5.5) -- el paso más importante del
// producto: acá es donde el vecino pasa de "estuvo llenando un formulario"
// a "tiene un reclamo registrado de verdad", con un código para hacer
// seguimiento. Todo lo que sigue (WhatsApp, notificaciones) es posterior y
// depende de que ESTO haya pasado -- ver CLAUDE.md > Reglas de WhatsApp:
// "el reclamo se guarda en la base ANTES de abrir WhatsApp, nunca después".
// Esta acción ni siquiera conoce WhatsApp: ese flujo (armar el mensaje,
// abrir wa.me) es una decisión de un paso posterior, no de este -- ver el
// reporte para el razonamiento completo de por qué quedó afuera del
// alcance de 5.5.
export async function createTicketAction(
  _prevState: CreateTicketState,
  input: unknown,
): Promise<CreateTicketState> {
  const parsed = createTicketInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "error",
      message: "Revisá los datos del formulario e intentá de nuevo.",
    };
  }
  const data = parsed.data;

  // Rate limiting (paso 5.11) -- ANTES de tocar la base, mismo lugar que
  // isRateLimited() en loginAction (ver CLAUDE.md > Rate limiting del
  // formulario público para los umbrales y su justificación). Un vecino
  // bloqueado nunca ve un error técnico -- el mensaje es honesto sobre lo
  // que pasó (mandó reclamos muy seguido) y qué hacer (esperar), sin
  // mencionar "rate limit" ni ningún término interno.
  const ip = await getClientIp();
  if (await isTicketSubmissionRateLimited(data.phoneE164, ip)) {
    return {
      status: "error",
      message:
        "Estás mandando reclamos muy seguido. Esperá unos minutos e intentá de nuevo.",
    };
  }

  // El token es la ÚNICA credencial de este flujo (ver public-form/
  // queries.ts) -- organizationId/buildingId salen DE ACÁ, nunca de nada
  // que el cliente mande. Un token inválido, o de un edificio dado de baja,
  // se trata igual (mismo criterio de ambigüedad del paso 5.1).
  const building = await getBuildingByPublicToken(data.token);
  if (!building) {
    return {
      status: "error",
      message:
        "No encontramos este enlace. Pedile el link a tu administración de nuevo.",
    };
  }
  if (!building.active) {
    return {
      status: "error",
      message: "Este edificio no está recibiendo reclamos por acá por ahora.",
    };
  }

  // Defensa contra "un unit_id de otro edificio": no alcanza con que el
  // uuid tenga forma válida, tiene que pertenecer A ESTE edificio, de ESTA
  // organización, y no estar dado de baja -- unitBelongsToBuilding() ya lo
  // exige así (reusada tal cual del paso 4.4, mismo criterio).
  if (!data.unitNotListed && data.unitId) {
    const unitOk = await unitBelongsToBuilding(
      building.organizationId,
      building.id,
      data.unitId,
    );
    if (!unitOk) {
      return {
        status: "error",
        message: "Tu unidad no es válida. Volvé a elegirla de la lista.",
      };
    }
  }

  // Defensa contra "una categoría de otra organización" (o inventada): sale
  // de acá, no de lo que mandó el cliente, y de acá también sale la
  // prioridad real del reclamo (categories.default_priority).
  const category = await getCategoryForTicket(
    building.organizationId,
    data.categoryId,
  );
  if (!category) {
    return {
      status: "error",
      message: "Esa categoría no existe. Volvé a elegirla de la lista.",
    };
  }

  // Defensa contra "un storage_path que no subió él": cada path tiene que
  // (a) existir DE VERDAD en el bucket (getExistingAttachmentPaths, una
  // SELECT real contra storage.objects) y (b) vivir bajo el prefijo
  // pending/<formSessionId>/ que ESTE mismo envío declara -- ver el
  // análisis de seguridad completo en el reporte. Los que no cumplen se
  // descartan en silencio: un adjunto inválido nunca tira abajo el resto
  // del reclamo (el ticket se guarda SIEMPRE, ver el enunciado del paso).
  const existingPaths =
    data.attachments.length > 0
      ? await getExistingAttachmentPaths(data.attachments.map((a) => a.path))
      : new Set<string>();
  const sessionPrefix = `pending/${data.formSessionId}/`;
  const attachmentsToInsert = data.attachments.filter(
    (a) => a.path.startsWith(sessionPrefix) && existingPaths.has(a.path),
  );

  // Se registra UNA vez acá, no dentro de attemptCreateTicket(): el
  // reintento acotado de más abajo (carrera de teléfono) es el MISMO envío
  // del vecino, no un segundo intento independiente -- contarlo dos veces
  // penalizaría a alguien que ya de por sí perdió una carrera de
  // concurrencia, no a nadie enviando de más.
  await recordTicketSubmissionAttempt(data.phoneE164, ip);

  try {
    const created = await attemptCreateTicket(
      building,
      category,
      attachmentsToInsert,
      data,
    );
    return {
      status: "success",
      publicCode: created.publicCode,
      priority: category.defaultPriority,
      attachmentsToken: created.attachmentsToken,
    };
  } catch (error) {
    if (!isPhoneRaceError(error)) {
      return translateCreateTicketError(error);
    }

    // Reintento único, acotado a la carrera de teléfono (ver
    // isPhoneRaceError arriba para la garantía de por qué alcanza con una
    // sola vuelta): attemptCreateTicket vuelve a buscar la persona desde
    // cero, y esta vez la va a encontrar como activeMatch -- la rama que
    // reusa sin insertar, así que no puede volver a chocar contra el mismo
    // índice. Si este segundo intento falla por CUALQUIER otro motivo (o,
    // en teoría, por la misma carrera otra vez, lo cual no debería pasar
    // según la garantía de arriba), no hay un tercer intento: se traduce
    // el error y se le pide al vecino reintentar a mano, igual que
    // cualquier otro fallo real.
    try {
      const created = await attemptCreateTicket(
        building,
        category,
        attachmentsToInsert,
        data,
      );
      return {
        status: "success",
        publicCode: created.publicCode,
        priority: category.defaultPriority,
        attachmentsToken: created.attachmentsToken,
      };
    } catch (retryError) {
      return translateCreateTicketError(retryError);
    }
  }
}

// Compuerta de rate limiting para la subida de adjuntos (paso 5.11) --
// pública a propósito, mismo criterio que createTicketAction: no hay sesión
// que exigir, el formulario público no tiene ninguna. NO sube nada: la
// subida real sigue yendo del navegador directo a Supabase Storage (paso
// 5.4, uploadFormAttachment en upload-attachment.ts) -- ese diseño no
// cambia acá, sigue siendo el único camino razonable sin hacer pasar los
// bytes del archivo por nuestro propio servidor. Esta acción solo responde
// "¿podés intentarlo?" ANTES de que el cliente llame a Storage; ver el
// comentario de uploadFormAttachment() sobre por qué hace falta esta
// compuerta separada en vez de "un rate limit en la Server Action de
// subida" (no existe tal acción: la subida nunca pasa por el servidor de
// Next).
export async function checkAttachmentUploadAllowedAction(): Promise<{
  allowed: boolean;
}> {
  const ip = await getClientIp();
  if (await isAttachmentUploadRateLimited(ip)) {
    return { allowed: false };
  }
  await recordAttachmentUploadAttempt(ip);
  return { allowed: true };
}

// Deja constancia de que el vecino TOCÓ el botón "Enviar por WhatsApp"
// (paso 5.9) -- NO de que el mensaje se haya entregado, ni siquiera de que
// se haya enviado. Riesgo R8 del plan: entre tocar el botón y que el
// mensaje llegue de verdad al administrador pasan varios pasos que esta
// acción no puede ver ni controlar -- WhatsApp (la app o WhatsApp Web)
// tiene que abrir con el texto precargado, el vecino tiene que decidir
// apretar "Enviar" ahí adentro (puede arrepentirse, puede editar el texto
// hasta vaciarlo, puede cerrar la app sin mandar nada), y recién si manda,
// WhatsApp tiene que entregarlo. Nada de eso es observable desde acá: un
// link `wa.me` no tiene webhook de "se mandó" ni de "se entregó" (eso solo
// existe del lado de la Cloud API de WhatsApp Business, que este flujo de
// entrada no usa a propósito -- ver CLAUDE.md > Reglas de WhatsApp). Por
// eso el nombre del evento es "se ABRIÓ el handoff", no "se mandó el
// aviso": es literalmente lo único que esta acción puede afirmar con
// certeza.
export async function registerWhatsappHandoffOpenedAction(
  token: string,
  publicCode: string,
): Promise<void> {
  // Nunca debe demorar la apertura de WhatsApp -- ver el comentario en
  // TicketForm sobre por qué se llama sin esperar la respuesta (fire and
  // forget) desde un <a href> real, no un window.open() disparado después
  // de un await. Acá adentro, en cambio, si algo no cierra (token
  // inválido, código que no existe, lo que sea) simplemente no se escribe
  // nada -- no hay ningún error que mostrarle al vecino sobre un evento de
  // analítica que ni sabe que existe, y el cliente que llama esto ya
  // descarta cualquier falla sin mirarla (ver más abajo).
  const parsedToken = z.uuid().safeParse(token);
  const parsedCode = z.string().min(1).max(50).safeParse(publicCode);
  if (!parsedToken.success || !parsedCode.success) {
    return;
  }

  // Mismo patrón que createTicketAction: el `token` es la única credencial
  // de este flujo, la organización sale de ACÁ, nunca de nada que el
  // cliente mande. `public_code` es único por ORGANIZACIÓN, no global (ver
  // el comentario del índice en src/db/schema/tickets.ts) -- sin resolver
  // la organización desde el token primero, un mismo código de otra
  // organización podría escribir un evento sobre un reclamo ajeno.
  const building = await getBuildingByPublicToken(parsedToken.data);
  if (!building) {
    return;
  }

  // Filtra por ORGANIZACIÓN **Y** EDIFICIO, no solo por organización --
  // `public_code` es único por organización, no por edificio (ver el
  // comentario del índice en src/db/schema/tickets.ts), así que un código
  // real de OTRO edificio de la MISMA organización (ej. el token de Torre
  // Central junto con un código real de Los Álamos) igual matchearía si
  // acá solo se filtrara por organización -- un token de un edificio no
  // tiene por qué poder escribir eventos sobre el reclamo de otro
  // edificio, aunque compartan organización.
  //
  // Defensa acotada, no anti-abuso completo (eso es un paso posterior, ver
  // el reporte de este paso para el razonamiento): quien conoce el token
  // de un edificio (el mismo que ya usó para cargar el formulario) podría
  // en teoría probar códigos de OTROS reclamos del MISMO edificio y
  // escribirles eventos falsos. El daño de eso es acotado a propósito por
  // lo que esta acción hace: un evento de más en una línea de tiempo, sin
  // payload, sin tocar ningún dato del reclamo ni de la persona -- no
  // crea, no borra, no cambia estado. Igual queda acotado a UN reclamo por
  // llamada (nunca a una lista ni a un rango): siempre hace falta un
  // public_code real y existente EN ESE edificio para que escriba algo.
  const [ticket] = await db
    .select({ id: tickets.id, personId: tickets.personId })
    .from(tickets)
    .where(
      and(
        eq(tickets.organizationId, building.organizationId),
        eq(tickets.buildingId, building.id),
        eq(tickets.publicCode, parsedCode.data),
      ),
    );
  if (!ticket) {
    return;
  }

  // actorLabel reusa el nombre del vecino tal como está guardado en
  // people (mismo dato ya escrito en el evento "created" del paso 5.5, no
  // uno nuevo) -- consistente con el resto de la línea de tiempo del
  // reclamo. Sin persona vinculada (no debería pasar para un reclamo del
  // formulario público, pero esta acción tampoco lo asume), cae a un
  // rótulo genérico en vez de fallar.
  let actorLabel = "Vecino";
  if (ticket.personId) {
    const [person] = await db
      .select({ firstName: people.firstName, lastName: people.lastName })
      .from(people)
      .where(eq(people.id, ticket.personId));
    if (person) {
      actorLabel =
        [person.firstName, person.lastName].filter(Boolean).join(" ") ||
        actorLabel;
    }
  }

  // Un evento por CADA toque del botón, no uno solo por reclamo -- a
  // propósito. El vecino puede tocarlo dos veces (se arrepintió, cerró
  // WhatsApp sin mandar, lo vuelve a intentar) o volver más tarde desde la
  // pantalla reconstruida (paso 5.8, `sentKey`) y tocarlo de nuevo. Cada
  // toque es un hecho real distinto -- `ticket_events` es un log
  // append-only (ver src/db/schema/ticket-events.ts), no un flag "ya
  // avisó sí/no": dos eventos con timestamps distintos le dicen al
  // administrador algo que un booleano no puede ("lo intentó dos veces,
  // la primera vez algo falló o se arrepintió"). Sin payload (el default
  // `{}` de la columna alcanza): no hay ningún dato adicional que valga la
  // pena guardar acá sin caer en "guardar de más" -- ni IP, ni
  // user-agent, ni nada de tracking (mismo criterio ya fijado en el paso
  // 5.5 para Ley 25.326/riesgo R7). El tipo de evento, el actor y el
  // momento ya cuentan toda la historia que este paso necesita contar.
  await db.insert(ticketEvents).values({
    organizationId: building.organizationId,
    ticketId: ticket.id,
    type: "whatsapp_handoff_opened",
    actorType: "neighbor",
    actorLabel,
  });
}

// Consulta de estado de un reclamo por public_code TIPEADO A MANO (paso
// 11.1, vía b -- la débil). Pública a propósito, mismo criterio que
// createTicketAction: no hay sesión. La "autorización" es el token público
// del edificio en la URL de `/r/[token]/estado` (la misma credencial de
// `/r/[token]`), que resuelve la organización ANTES de mirar el código --
// nunca una búsqueda global a ciegas por public_code.
//
// Devuelve SOLO lo mínimo para confirmar el reclamo (ver
// getTicketStatusByPublicCode y PublicTicketStatus): sin descripción, sin
// nombre de quien reportó, sin fotos, sin asignado, sin notas. La vista
// rica sigue detrás de `attachments_token` (`/s/[token]`), que esta acción
// NO revela -- adivinar un código corto no puede escalar a esos datos.
export async function lookupTicketStatusAction(
  _prevState: TicketStatusLookupState,
  input: unknown,
): Promise<TicketStatusLookupState> {
  const parsed = ticketStatusLookupSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "error",
      message: "Revisá el código: tiene que ser como TC-2026-0007.",
    };
  }

  // Rate limit ANTES de tocar la base -- mismo lugar y criterio que
  // createTicketAction (ver rate-limit.ts para los umbrales y por qué esta
  // vía los necesita). Un bloqueo NO se registra (no alarga su propia
  // ventana) y no distingue "código inválido" de "demasiadas consultas"
  // más de lo necesario.
  const ip = await getClientIp();
  if (await isStatusLookupRateLimited(ip)) {
    return {
      status: "error",
      message:
        "Hiciste muchas consultas seguidas. Esperá unos minutos e intentá de nuevo.",
    };
  }
  await recordStatusLookupAttempt(ip);

  // El token resuelve el edificio (y con él la organización). Token
  // inválido o edificio dado de baja: mismo mensaje ambiguo que todo lo
  // demás. NO se chequea `building.active`: un edificio que dejó de
  // recibir reclamos NUEVOS igual tiene reclamos viejos cuyo estado un
  // vecino puede querer consultar (decisión propia, ver el reporte).
  const building = await getBuildingByPublicToken(parsed.data.token);
  if (!building) {
    return {
      status: "error",
      message: "No encontramos ningún reclamo con ese código.",
    };
  }

  const ticket = await getTicketStatusByPublicCode(
    building.id,
    parsed.data.publicCode,
  );
  if (!ticket) {
    return {
      status: "error",
      message: "No encontramos ningún reclamo con ese código.",
    };
  }

  return { status: "found", ticket };
}

// -----------------------------------------------------------------------
// Descarga pública de un documento visible del edificio (paso 11.3)
// -----------------------------------------------------------------------

const publicDocumentDownloadSchema = z.object({
  token: z.uuid(),
  documentId: z.uuid(),
});

export type PublicDocumentDownloadResult =
  { ok: true; url: string } | { ok: false; error: string };

// Genera, BAJO DEMANDA, una URL firmada de corta duración para descargar un
// documento del edificio marcado `visibility = 'residents'`. Pública a
// propósito -- NO usa authorizedAction() (eso es getDocumentDownloadUrlAction
// del paso 10.4, para el panel). La "autorización" acá son TRES condiciones,
// todas obligatorias, que reemplazan a la sesión:
//
//  1. `token` (`public_token`) resuelve un edificio real Y ACTIVO -- mismo
//     mecanismo que el formulario y `/r/[token]/estado` (getBuildingByPublicToken).
//  2. El documento pertenece a ESE edificio y a su organización.
//  3. `visibility = 'residents'` (y `deleted_at IS NULL`).
//
// Cualquiera que falle -> el mismo "No encontramos ese documento." ambiguo
// del resto de la superficie pública: un documento privado, uno de otro
// edificio, o un id inventado son indistinguibles en la respuesta.
//
// Recién con las tres cumplidas, `createDocumentDownloadUrl` (documents/
// storage-objects.ts, REUSADA tal cual del 10.4) firma con
// `createAdminClient()`. Mismo TTL de 5 minutos que el 10.4: acá tampoco
// hay "sesión de lectura", la URL se pide al click y el navegador la
// consume en segundos (ver DOCUMENT_DOWNLOAD_URL_EXPIRES_IN_SECONDS).
//
// Sin rate limit: a diferencia de la consulta por `public_code` (11.1,
// código corto y enumerable), acá el `documentId` es un uuid random no
// adivinable y la acción hace un solo SELECT indexado antes de fallar --
// no hay nada que enumerar con provecho.
export async function getPublicDocumentDownloadUrlAction(
  input: unknown,
): Promise<PublicDocumentDownloadResult> {
  const parsed = publicDocumentDownloadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "No encontramos ese documento." };
  }

  const building = await getBuildingByPublicToken(parsed.data.token);
  if (!building || !building.active) {
    return { ok: false, error: "No encontramos ese documento." };
  }

  const [doc] = await db
    .select({
      storagePath: documents.storagePath,
      originalFilename: documents.originalFilename,
    })
    .from(documents)
    .where(
      and(
        eq(documents.id, parsed.data.documentId),
        eq(documents.buildingId, building.id),
        eq(documents.organizationId, building.organizationId),
        eq(documents.visibility, "residents"),
        isNull(documents.deletedAt),
      ),
    );

  if (!doc) {
    return { ok: false, error: "No encontramos ese documento." };
  }

  try {
    const url = await createDocumentDownloadUrl(
      doc.storagePath,
      doc.originalFilename,
    );
    return { ok: true, url };
  } catch {
    return {
      ok: false,
      error: "No pudimos preparar la descarga. Probá de nuevo en un momento.",
    };
  }
}

// -----------------------------------------------------------------------
// El vecino agrega información o fotos a un reclamo abierto (paso 11.4)
// -----------------------------------------------------------------------

// "Abierto" para este paso -- verificado contra el enum real de
// `tickets.status` (src/db/schema/tickets.ts): [new, in_progress, resolved,
// closed, discarded]. Solo los dos primeros admiten que el vecino agregue
// algo; resuelto/cerrado/descartado NO (ver el reporte).
const OPEN_TICKET_STATUSES: ReadonlySet<
  (typeof tickets.$inferSelect)["status"]
> = new Set(["new", "in_progress"]);

// Pública a propósito -- mismo criterio que createTicketAction: sin sesión,
// la "autorización" es el `attachments_token` del reclamo (no adivinable).
// Decisión de producto: NO dispara ninguna notificación ni email al
// administrador -- alcanza con que quede visible al abrir el reclamo en el
// panel (ver CLAUDE.md).
//
// Recibe un `FormData` porque lleva los `File` de las fotos ya comprimidas
// en el navegador (compressImage, compress-image.ts -- Canvas, solo
// cliente). La subida a Storage la hace ESTA acción con `createAdminClient`
// (a diferencia del alta del 5.4, donde el navegador sube directo): acá el
// reclamo ya existe, así que conviene chequear el tope de 5 adjuntos y el
// estado abierto ANTES de tocar Storage, de forma atómica.
export async function addResidentUpdateAction(
  _prevState: ResidentUpdateState,
  formData: FormData,
): Promise<ResidentUpdateState> {
  const tokenParsed = z.uuid().safeParse(formData.get("token"));
  const textParsed = residentUpdateTextSchema.safeParse(
    formData.get("text") ?? undefined,
  );
  if (!tokenParsed.success || !textParsed.success) {
    return {
      status: "error",
      message: `Revisá los datos e intentá de nuevo (el texto va hasta ${MAX_RESIDENT_UPDATE_TEXT} caracteres).`,
    };
  }
  const token = tokenParsed.data;
  const text = textParsed.data;

  const files = formData
    .getAll("photo")
    .filter((f): f is File => f instanceof File && f.size > 0);

  if (!text && files.length === 0) {
    return { status: "error", message: "Agregá un texto o al menos una foto." };
  }

  // Rate limit ANTES de tocar la base -- solo por IP (ver rate-limit.ts).
  // Un bloqueo NO se registra.
  const ip = await getClientIp();
  if (await isResidentUpdateRateLimited(ip)) {
    return {
      status: "error",
      message:
        "Estás enviando información muy seguido. Esperá unos minutos e intentá de nuevo.",
    };
  }

  const ticket = await getResidentUpdateTicket(token);
  if (!ticket) {
    return { status: "error", message: "No encontramos ese reclamo." };
  }
  if (!OPEN_TICKET_STATUSES.has(ticket.status)) {
    return {
      status: "error",
      message:
        "Este reclamo ya no está abierto, así que no se le puede agregar información.",
    };
  }

  await recordResidentUpdateAttempt(ip);

  // Validación de cada archivo (tipo + tamaño ya comprimido) -- reusa los
  // validadores del 5.4, no reimplementa.
  for (const file of files) {
    if (
      !(ACCEPTED_ATTACHMENT_MIME_TYPES as readonly string[]).includes(file.type)
    ) {
      return {
        status: "error",
        message: "Alguno de los archivos no es una foto ni un PDF.",
      };
    }
    const sizeError = validateAttachmentSize(file.size);
    if (sizeError) {
      return { status: "error", message: sizeError };
    }
  }

  // Tope TOTAL de 5 adjuntos (MAX_TICKET_PHOTOS, riesgo R4) -- el mismo que
  // el alta del 5.4, no uno nuevo. Cuenta los adjuntos activos actuales.
  let photoRejection: string | null = null;
  let filesToUpload: File[] = [];
  if (files.length > 0) {
    const [existingRow] = await db
      .select({ value: count() })
      .from(ticketAttachments)
      .where(
        and(
          eq(ticketAttachments.ticketId, ticket.id),
          isNull(ticketAttachments.deletedAt),
        ),
      );
    const existing = existingRow?.value ?? 0;
    const remaining = MAX_TICKET_PHOTOS - existing;
    if (remaining <= 0) {
      photoRejection = `Este reclamo ya tiene el máximo de ${MAX_TICKET_PHOTOS} fotos, no se pueden agregar más.`;
    } else if (files.length > remaining) {
      photoRejection = `Solo podés agregar ${remaining} foto${
        remaining === 1 ? "" : "s"
      } más (el máximo es ${MAX_TICKET_PHOTOS}).`;
    } else {
      filesToUpload = files;
    }
  }

  // Fotos rechazadas y sin texto -> no hay nada que guardar.
  if (photoRejection && !text && filesToUpload.length === 0) {
    return { status: "error", message: photoRejection };
  }

  // Subida a Storage (mismo bucket/patrón `pending/` que el 5.4). Carpeta
  // al azar por envío -- no lleva el token en el path.
  const uploaded: {
    path: string;
    mimeType: string;
    sizeBytes: number;
    originalFilename: string;
  }[] = [];
  if (filesToUpload.length > 0) {
    const supabase = createAdminClient();
    const folder = `pending/${crypto.randomUUID()}`;
    for (let i = 0; i < filesToUpload.length; i++) {
      const file = filesToUpload[i]!;
      const ext = file.type === "application/pdf" ? "pdf" : "jpg";
      const path = `${folder}/${i}-${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from(TICKET_ATTACHMENTS_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) {
        if (uploaded.length > 0) {
          // Best-effort, no relanza -- ver el comentario del catch de la
          // transacción más abajo.
          await supabase.storage
            .from(TICKET_ATTACHMENTS_BUCKET)
            .remove(uploaded.map((u) => u.path))
            .catch(() => {});
        }
        return {
          status: "error",
          message: "No pudimos subir las fotos. Probá de nuevo en un momento.",
        };
      }
      uploaded.push({
        path,
        mimeType: file.type,
        sizeBytes: file.size,
        originalFilename: file.name,
      });
    }
  }

  // Base: insert de adjuntos + UN evento `resident_update_added`, en una
  // transacción. Re-cuenta el tope DENTRO de la transacción para cerrar la
  // carrera de dos envíos simultáneos.
  try {
    await db.transaction(async (tx) => {
      if (uploaded.length > 0) {
        const [nowRow] = await tx
          .select({ value: count() })
          .from(ticketAttachments)
          .where(
            and(
              eq(ticketAttachments.ticketId, ticket.id),
              isNull(ticketAttachments.deletedAt),
            ),
          );
        if ((nowRow?.value ?? 0) + uploaded.length > MAX_TICKET_PHOTOS) {
          throw new Error("TOTE_EXCEEDED");
        }
        await tx.insert(ticketAttachments).values(
          uploaded.map((u) => ({
            organizationId: ticket.organizationId,
            ticketId: ticket.id,
            storagePath: u.path,
            mimeType: u.mimeType,
            sizeBytes: u.sizeBytes,
            originalFilename: u.originalFilename,
          })),
        );
      }

      await tx.insert(ticketEvents).values({
        organizationId: ticket.organizationId,
        ticketId: ticket.id,
        type: "resident_update_added",
        actorType: "neighbor",
        actorLabel: ticket.neighborName,
        payload: { text: text ?? null, photoCount: uploaded.length },
      });
    });
  } catch (error) {
    if (uploaded.length > 0) {
      // Limpieza best-effort: si ESTO falla (red, Storage caído), el objeto
      // queda huérfano bajo `pending/` -- el mismo destino, y la misma
      // limpieza periódica futura, que un formulario abandonado del 5.4
      // (ver CLAUDE.md > Pendientes). No se relanza: la limpieza nunca debe
      // volverse un error nuevo para el vecino (mismo criterio que
      // deleteFormAttachment del 5.4).
      await createAdminClient()
        .storage.from(TICKET_ATTACHMENTS_BUCKET)
        .remove(uploaded.map((u) => u.path))
        .catch(() => {});
    }
    const raced = error instanceof Error && error.message === "TOTE_EXCEEDED";
    return {
      status: "error",
      message: raced
        ? `Este reclamo llegó al máximo de ${MAX_TICKET_PHOTOS} fotos mientras enviabas. Recargá la página.`
        : "No pudimos guardar la información. Probá de nuevo en un momento.",
    };
  }

  return {
    status: "success",
    message: photoRejection
      ? `Guardamos tu información. ${photoRejection}`
      : "Listo. Tu administración va a ver esto cuando abra el reclamo.",
  };
}
