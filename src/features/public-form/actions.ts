"use server";

import { and, eq, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { people, ticketAttachments, ticketEvents, tickets } from "@/db/schema";
import {
  findDeletedPersonByPhone,
  findPersonByPhone,
  unitBelongsToBuilding,
} from "@/features/people/queries";
import { PHONE_UNIQUE_CONSTRAINT } from "@/features/people/constraints";
import { UNIQUE_VIOLATION, unwrapPostgresError } from "@/lib/postgres-errors";

import type { PublicBuilding, TicketCategory } from "./queries";
import { getBuildingByPublicToken, getCategoryForTicket } from "./queries";
import { getExistingAttachmentPaths } from "./storage-objects";
import {
  createTicketInputSchema,
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
): Promise<{ id: string; publicCode: string }> {
  const activeMatch = await findPersonByPhone(
    building.organizationId,
    data.phoneE164,
  );
  const deletedMatch = activeMatch
    ? null
    : await findDeletedPersonByPhone(building.organizationId, data.phoneE164);

  return db.transaction(async (tx) => {
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
        title: deriveTicketTitle(data.description),
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
      // vecino.
      .returning({ id: tickets.id, publicCode: tickets.publicCode });
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

    return ticket;
  });
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

  try {
    const created = await attemptCreateTicket(
      building,
      category,
      attachmentsToInsert,
      data,
    );
    return { status: "success", publicCode: created.publicCode };
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
      return { status: "success", publicCode: created.publicCode };
    } catch (retryError) {
      return translateCreateTicketError(retryError);
    }
  }
}
