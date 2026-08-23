"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { announcements } from "@/db/schema";
import { getActiveBuildings } from "@/features/buildings/queries";
import { authorizedAction } from "@/lib/auth";

import {
  countSegmentRecipients,
  getBuildingTowersAndFloors,
  searchPeopleForSegment,
  type BuildingTowersAndFloors,
  type PersonSearchResult,
} from "./queries";
import {
  countSegmentInputSchema,
  createAnnouncementDraftSchema,
  updateAnnouncementDraftSchema,
  type CreateAnnouncementDraftResult,
  type SegmentRecipientCount,
  type UpdateAnnouncementDraftResult,
} from "./segment-schema";
import { getAnnouncementTemplate } from "./templates";

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
