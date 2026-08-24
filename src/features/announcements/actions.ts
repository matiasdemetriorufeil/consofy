"use server";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { announcementRecipients, announcements } from "@/db/schema";
import { getActiveBuildings } from "@/features/buildings/queries";
import { authorizedAction } from "@/lib/auth";

import {
  countSegmentRecipients,
  getAnnouncementForSend,
  getBuildingTowersAndFloors,
  getMaterializedRecipients,
  getSegmentRecipientsForPreview,
  searchPeopleForSegment,
  type BuildingTowersAndFloors,
  type PersonSearchResult,
} from "./queries";
import {
  countSegmentInputSchema,
  createAnnouncementDraftSchema,
  markRecipientFailedSchema,
  updateAnnouncementDraftSchema,
  type CreateAnnouncementDraftResult,
  type SegmentRecipientCount,
  type UpdateAnnouncementDraftResult,
} from "./segment-schema";
import {
  getAnnouncementTemplate,
  resolveRecipientPlaceholders,
} from "./templates";

// Nunca se confía en el buildingId que manda el cliente sin cruzarlo --
// mismo criterio que setSelectedBuildingAction (buildings/actions.ts):
// tiene que ser uno de los edificios ACTIVOS de la organización de quien
// llama, o `null` ("toda la organización", ver announcements.buildingId).
// Devuelve `false` para un uuid de otra organización, uno dado de baja, o
// inventado -- las tres caen en el mismo mensaje ambiguo del caller.
async function isValidBuildingSelection(
  organizationId: string,
  buildingId: string | null,
): Promise<boolean> {
  if (buildingId === null) {
    return true;
  }
  const activeBuildings = await getActiveBuildings(organizationId);
  return activeBuildings.some((b) => b.id === buildingId);
}

// Paso 8.3 -- si se eligió una plantilla, TODAS sus variables de comunicado
// tienen que venir completas (no vacías/solo espacios) antes de guardar,
// revalidado acá aunque el cliente ya lo chequee -- mismo criterio de
// "Zod en el servidor siempre" que el resto del proyecto (CLAUDE.md >
// Reglas de seguridad), aplicado a mano porque el shape de `variables`
// depende de CUÁL plantilla se eligió, algo que un schema de Zod estático
// no puede expresar sin conocer la plantilla. Un `templateId` que no
// matchea ninguna plantilla conocida (una borrada del código después de
// que un borrador viejo la usó) NO bloquea el guardado -- `body` ya trae
// el texto final, no depende de que la plantilla siga existiendo (ver el
// comentario de la columna en announcements.ts).
function validateTemplateVariables(
  templateId: string | null,
  templateVariables: Record<string, string>,
): string | null {
  if (templateId === null) {
    return null;
  }
  const template = getAnnouncementTemplate(templateId);
  if (!template) {
    return null;
  }
  const missing = template.variables.find(
    (v) => !templateVariables[v.key]?.trim(),
  );
  if (missing) {
    return `Completá "${missing.label}" antes de guardar.`;
  }
  return null;
}

// Opciones de torre/piso para el edificio elegido (paso 8.2) -- se llama
// cada vez que cambia el `buildingId` del formulario, ANTES de mostrar los
// selectores de torre/piso. Mismo chequeo de pertenencia que las otras dos
// acciones: nunca se resuelve contra un buildingId sin validar.
export const getBuildingTowersAndFloorsAction = authorizedAction(
  async (context, buildingId: string): Promise<BuildingTowersAndFloors> => {
    const parsed = z.uuid().safeParse(buildingId);
    if (!parsed.success) {
      return { towers: [], floors: [] };
    }
    if (
      !(await isValidBuildingSelection(context.organization.id, parsed.data))
    ) {
      return { towers: [], floors: [] };
    }
    return getBuildingTowersAndFloors(context.organization.id, parsed.data);
  },
);

export type CountSegmentResult =
  ({ ok: true } & SegmentRecipientCount) | { ok: false; error: string };

// Conteo en vivo (paso 8.2) -- se llama desde AnnouncementSegmentForm con
// debounce cada vez que cambia algún criterio, mientras el administrador
// todavía está armando el segmento (antes de guardar nada). Server Action,
// no una query directa desde el cliente: el cliente nunca toca Drizzle
// (ver CLAUDE.md > Acceso a datos), y esto necesita `organizationId` de
// una sesión real.
export const countSegmentRecipientsAction = authorizedAction(
  async (context, input: unknown): Promise<CountSegmentResult> => {
    const parsed = countSegmentInputSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Datos inválidos." };
    }
    const { buildingId, segment } = parsed.data;

    if (
      !(await isValidBuildingSelection(context.organization.id, buildingId))
    ) {
      return { ok: false, error: "Elegí un edificio válido." };
    }

    const counts = await countSegmentRecipients(
      context.organization.id,
      buildingId,
      segment,
    );
    return { ok: true, ...counts };
  },
);

// Búsqueda para "agregar una persona a mano" -- ver
// queries.ts#searchPeopleForSegment.
export const searchPeopleForSegmentAction = authorizedAction(
  async (context, query: string): Promise<PersonSearchResult[]> => {
    return searchPeopleForSegment(context.organization.id, query);
  },
);

// Crea el aviso como BORRADOR (paso 8.2) -- status 'draft' (default de la
// columna), sin tocar ningún destinatario real todavía: `segment` queda
// persistido tal cual, pero materializar filas en announcement_recipients
// y disparar el envío es trabajo de 8.4/8.5, no de este paso.
export const createAnnouncementDraftAction = authorizedAction(
  async (context, input: unknown): Promise<CreateAnnouncementDraftResult> => {
    const parsed = createAnnouncementDraftSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos.",
      };
    }
    const { title, body, buildingId, segment, templateId, templateVariables } =
      parsed.data;

    if (
      !(await isValidBuildingSelection(context.organization.id, buildingId))
    ) {
      return { ok: false, error: "Elegí un edificio válido." };
    }

    const variableError = validateTemplateVariables(
      templateId,
      templateVariables,
    );
    if (variableError) {
      return { ok: false, error: variableError };
    }

    const [row] = await db
      .insert(announcements)
      .values({
        organizationId: context.organization.id,
        buildingId,
        title,
        body,
        segment,
        templateId,
        templateVariables,
        createdBy: context.appUser.displayName,
      })
      .returning({ id: announcements.id });

    if (!row) {
      return {
        ok: false,
        error: "No pudimos guardar el borrador. Probá de nuevo en un momento.",
      };
    }

    revalidatePath("/panel/announcements");
    return { ok: true, id: row.id };
  },
);

// Actualiza un borrador YA EXISTENTE (paso 8.3) -- mismo registro, nunca
// crea uno nuevo. Solo alcanza borradores (`status = 'draft'`): un aviso que
// ya avanzó de estado (todavía no alcanzable en la práctica -- 8.4/8.5 no
// existen aún) no se edita por esta vía. Filtra por `organizationId` en el
// WHERE del UPDATE mismo (nunca después, en JS) -- mismo patrón que el
// resto del proyecto (CLAUDE.md > Acceso a datos): un `id` de otra
// organización, o inexistente, no actualiza ninguna fila y cae al mismo
// mensaje ambiguo.
export const updateAnnouncementDraftAction = authorizedAction(
  async (context, input: unknown): Promise<UpdateAnnouncementDraftResult> => {
    const parsed = updateAnnouncementDraftSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos.",
      };
    }
    const {
      id,
      title,
      body,
      buildingId,
      segment,
      templateId,
      templateVariables,
    } = parsed.data;

    if (
      !(await isValidBuildingSelection(context.organization.id, buildingId))
    ) {
      return { ok: false, error: "Elegí un edificio válido." };
    }

    const variableError = validateTemplateVariables(
      templateId,
      templateVariables,
    );
    if (variableError) {
      return { ok: false, error: variableError };
    }

    const [row] = await db
      .update(announcements)
      .set({
        buildingId,
        title,
        body,
        segment,
        templateId,
        templateVariables,
      })
      .where(
        and(
          eq(announcements.id, id),
          eq(announcements.organizationId, context.organization.id),
          eq(announcements.status, "draft"),
          isNull(announcements.deletedAt),
        ),
      )
      .returning({ id: announcements.id });

    if (!row) {
      return {
        ok: false,
        error: "No encontramos ese borrador.",
      };
    }

    revalidatePath("/panel/announcements");
    revalidatePath(`/panel/announcements/${id}`);
    return { ok: true };
  },
);

// Si ya no queda ningún destinatario 'pending' para este aviso, el envío
// terminó -- transición automática 'sending' -> 'sent' (paso 8.5), sin
// ninguna acción manual de "marcar como enviado" (no la pide el
// enunciado, y el propio estado de los destinatarios ya alcanza para
// derivarlo). Compare-and-swap contra `status = 'sending'`: nunca pisa un
// estado que no sea ese.
//
// `sentAt` se setea EN esta misma escritura (corrección del paso 8.6,
// hallazgo real: esta función cambiaba `status` a 'sent' sin completar
// nunca `sent_at`, dejando la columna en null incluso para avisos
// terminados de verdad -- el historial del 8.6 no podía mostrar la fecha
// de envío real de ningún aviso nuevo, solo la del seed). Una sola
// escritura, no dos: el momento en que se decide "ya está" es el mismo
// momento en que hay que registrar cuándo pasó.
async function maybeMarkAnnouncementSent(
  organizationId: string,
  announcementId: string,
): Promise<void> {
  const [remaining] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(announcementRecipients)
    .where(
      and(
        eq(announcementRecipients.announcementId, announcementId),
        eq(announcementRecipients.organizationId, organizationId),
        eq(announcementRecipients.deliveryStatus, "pending"),
        isNull(announcementRecipients.deletedAt),
      ),
    );

  if (remaining?.count !== 0) {
    return;
  }

  await db
    .update(announcements)
    .set({ status: "sent", sentAt: new Date() })
    .where(
      and(
        eq(announcements.id, announcementId),
        eq(announcements.organizationId, organizationId),
        eq(announcements.status, "sending"),
      ),
    );
}

export type MaterializeRecipientsResult =
  { ok: true } | { ok: false; error: string };

// Materializa la lista de destinatarios de un aviso EN announcement_recipients
// (paso 8.5) -- UNA SOLA VEZ por aviso, la primera vez que se abre la
// pantalla de envío. Decisión explícita del enunciado, no reinterpretada:
// si ya existen filas para este `announcementId`, esta acción es un no-op
// (nunca vuelve a correr getSegmentRecipientsForPreview ni pisa ningún
// status ya escrito) -- eso es lo que protege un envío ya empezado contra
// cambios posteriores en los datos (alguien cambia de teléfono, deja de
// calificar por el criterio). El chequeo "¿ya existen filas?" +el INSERT
// tienen una ventana de carrera teórica entre sí (dos llamadas
// concurrentes podrían ver 0 filas las dos) -- se cierra con
// `.onConflictDoNothing()` sobre la unique constraint
// (announcement_id, person_id): la segunda llamada, aunque alcance a
// calcular las mismas filas, no inserta duplicados.
export const materializeAnnouncementRecipientsAction = authorizedAction(
  async (
    context,
    announcementId: string,
  ): Promise<MaterializeRecipientsResult> => {
    const parsedId = z.uuid().safeParse(announcementId);
    if (!parsedId.success) {
      return { ok: false, error: "Aviso inválido." };
    }

    const announcement = await getAnnouncementForSend(
      context.organization.id,
      parsedId.data,
    );
    if (!announcement) {
      return { ok: false, error: "No encontramos ese aviso." };
    }

    const existing = await getMaterializedRecipients(
      context.organization.id,
      announcement.id,
    );
    if (existing.length > 0) {
      return { ok: true };
    }

    const recipients = await getSegmentRecipientsForPreview(
      context.organization.id,
      announcement.buildingId,
      announcement.segment,
    );

    const rows = recipients.map((r) => {
      const hasPhone = !!r.phoneE164;
      const nombre = [r.firstName, r.lastName].filter(Boolean).join(" ");
      return {
        organizationId: context.organization.id,
        announcementId: announcement.id,
        personId: r.id,
        deliveryStatus: (hasPhone ? "pending" : "skipped") as
          "pending" | "skipped",
        // Congelados en el momento de materializar -- ver el comentario de
        // estas dos columnas en src/db/schema/announcement-recipients.ts.
        phoneSnapshot: hasPhone ? r.phoneE164 : null,
        messageSnapshot: hasPhone
          ? resolveRecipientPlaceholders(announcement.body, {
              nombre,
              unidad: r.unitLabels.length > 0 ? r.unitLabels.join(", ") : null,
            })
          : null,
        // Mismo motivo de exclusión ya calculado en el 8.2/8.4 (sin
        // teléfono cargado) -- no se recalcula, se documenta acá.
        errorMessage: hasPhone ? null : "Sin teléfono cargado.",
      };
    });

    await db.transaction(async (tx) => {
      if (rows.length > 0) {
        await tx
          .insert(announcementRecipients)
          .values(rows)
          .onConflictDoNothing();
      }
      // 'draft' -> 'sending': el envío arranca acá. Compare-and-swap contra
      // 'draft' -- si dos llamadas concurrentes llegan hasta acá, solo la
      // primera cambia algo; la segunda actualiza 0 filas, sin error.
      await tx
        .update(announcements)
        .set({ status: "sending" })
        .where(
          and(
            eq(announcements.id, announcement.id),
            eq(announcements.organizationId, context.organization.id),
            eq(announcements.status, "draft"),
          ),
        );
    });

    // Segmento vacío, o compuesto enteramente por personas sin teléfono:
    // no queda ningún 'pending' desde el arranque -- el envío ya está
    // completo, no debería quedar mostrando "sending" para siempre.
    await maybeMarkAnnouncementSent(context.organization.id, announcement.id);

    revalidatePath(`/panel/announcements/${announcement.id}/send`);
    return { ok: true };
  },
);

export type MarkRecipientResult = { ok: true } | { ok: false; error: string };

// Marca UN destinatario puntual como 'link_opened' + sent_at (paso 8.5) --
// llamada por el cliente DESPUÉS de que el link real ya se abrió (fire and
// forget, mismo criterio que registerWhatsappHandoffOpenedAction del flujo
// de entrada, paso 5.9: no debe demorar ni condicionar la apertura del
// link real, que ya ocurrió con un <a href> resuelto de antemano -- ver
// el comentario del componente cliente). Compare-and-swap contra
// `delivery_status = 'pending'`: un destinatario que ya cambió de estado
// (doble click, dos pestañas) no se reescribe.
export const markRecipientLinkOpenedAction = authorizedAction(
  async (context, recipientId: string): Promise<MarkRecipientResult> => {
    const parsed = z.uuid().safeParse(recipientId);
    if (!parsed.success) {
      return { ok: false, error: "Destinatario inválido." };
    }

    const [row] = await db
      .update(announcementRecipients)
      .set({ deliveryStatus: "link_opened", sentAt: new Date() })
      .where(
        and(
          eq(announcementRecipients.id, parsed.data),
          eq(announcementRecipients.organizationId, context.organization.id),
          eq(announcementRecipients.deliveryStatus, "pending"),
        ),
      )
      .returning({ announcementId: announcementRecipients.announcementId });

    if (!row) {
      return {
        ok: false,
        error: "No encontramos ese destinatario pendiente.",
      };
    }

    await maybeMarkAnnouncementSent(
      context.organization.id,
      row.announcementId,
    );

    revalidatePath(`/panel/announcements/${row.announcementId}/send`);
    return { ok: true };
  },
);

// Marcar a mano un destinatario como 'failed' (paso 8.5) -- caso real: el
// administrador abre (o intenta abrir) WhatsApp y descubre que el número
// no funciona, algo que el sistema no puede saber de antemano (el
// teléfono ya pasó la validación de formato E.164 argentino al cargar la
// persona -- lo que puede fallar es que el NÚMERO no exista de verdad o
// no tenga WhatsApp, algo que ningún chequeo de formato detecta). Permitido
// desde 'pending' (nunca se llegó a intentar) O 'link_opened' (se abrió el
// link y recién ahí se descubrió el problema) -- desde 'skipped' o
// 'failed' no tiene sentido (ya están en un estado terminal).
export const markRecipientFailedAction = authorizedAction(
  async (context, input: unknown): Promise<MarkRecipientResult> => {
    const parsed = markRecipientFailedSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos.",
      };
    }
    const { recipientId, reason } = parsed.data;

    const [row] = await db
      .update(announcementRecipients)
      .set({ deliveryStatus: "failed", errorMessage: reason })
      .where(
        and(
          eq(announcementRecipients.id, recipientId),
          eq(announcementRecipients.organizationId, context.organization.id),
          inArray(announcementRecipients.deliveryStatus, [
            "pending",
            "link_opened",
          ]),
        ),
      )
      .returning({ announcementId: announcementRecipients.announcementId });

    if (!row) {
      return { ok: false, error: "No encontramos ese destinatario." };
    }

    await maybeMarkAnnouncementSent(
      context.organization.id,
      row.announcementId,
    );

    revalidatePath(`/panel/announcements/${row.announcementId}/send`);
    return { ok: true };
  },
);
