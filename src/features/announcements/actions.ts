"use server";

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
  type CreateAnnouncementDraftResult,
  type SegmentRecipientCount,
} from "./segment-schema";

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
    const { title, body, buildingId, segment } = parsed.data;

    if (
      !(await isValidBuildingSelection(context.organization.id, buildingId))
    ) {
      return { ok: false, error: "Elegí un edificio válido." };
    }

    const [row] = await db
      .insert(announcements)
      .values({
        organizationId: context.organization.id,
        buildingId,
        title,
        body,
        segment,
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
