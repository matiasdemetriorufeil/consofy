import "server-only";

import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import { buildings, reminders } from "@/db/schema";

import type { ReminderStatusValue } from "./reminder-schema";

export type ReminderListRow = {
  id: string;
  buildingId: string;
  buildingName: string;
  title: string;
  description: string | null;
  dueDate: string;
  noticeDays: number;
  recurrence: (typeof reminders.$inferSelect)["recurrence"];
  status: ReminderStatusValue;
};

// Mismo patrón de organización que el resto del proyecto (ver CLAUDE.md >
// Acceso a datos): `organizationId` primero y obligatorio. `buildingId`
// segundo, OPCIONAL -- `null` es "todos los edificios" (vista agregada
// legítima, ver CLAUDE.md > Selector de edificio activo), no un valor
// especial que haya que guardar. `buildingName` siempre viene en el SELECT
// (INNER JOIN barato, `reminders.building_id` es NOT NULL) para que la UI
// decida sin una consulta aparte si mostrar la columna Edificio -- mismo
// criterio que `showBuildingColumn` en la bandeja de reclamos.
//
// `statuses` opcional: sin filtro (`null`), trae TODOS los estados -- la
// página lo usa para distinguir "no hay ningún recordatorio en este
// alcance" de "no hay ninguno con este filtro puntual" (mismo criterio que
// `hasExplicitFilters()` en la bandeja de reclamos), y también para el
// caso "todos los estados" del filtro.
//
// Sin paginación a propósito: los recordatorios de un edificio (fumigación,
// service de matafuegos, VTV del ascensor...) son, en la práctica, un
// puñado por edificio -- mismo orden de magnitud que las unidades de un
// edificio (ver el comentario de getUnitsForBuilding()), no la bandeja de
// reclamos.
export async function getReminderList(
  organizationId: string,
  buildingId: string | null,
  statuses: ReminderStatusValue[] | null,
): Promise<ReminderListRow[]> {
  return db
    .select({
      id: reminders.id,
      buildingId: reminders.buildingId,
      buildingName: buildings.name,
      title: reminders.title,
      description: reminders.description,
      dueDate: reminders.dueDate,
      noticeDays: reminders.noticeDays,
      recurrence: reminders.recurrence,
      status: reminders.status,
    })
    .from(reminders)
    .innerJoin(buildings, eq(buildings.id, reminders.buildingId))
    .where(
      and(
        eq(reminders.organizationId, organizationId),
        buildingId ? eq(reminders.buildingId, buildingId) : undefined,
        statuses && statuses.length > 0
          ? inArray(reminders.status, statuses)
          : undefined,
        isNull(reminders.deletedAt),
      ),
    )
    .orderBy(asc(reminders.dueDate), asc(reminders.title));
}

// Distingue, cuando el listado filtrado da cero filas, "este alcance no
// tiene NINGÚN recordatorio todavía" de "no hay ninguno con este filtro" --
// mismo criterio que organizationHasAnyTicket() en tickets/queries.ts,
// disparada solo en esa rama puntual (ver page.tsx), nunca en el camino
// normal.
export async function organizationHasAnyReminder(
  organizationId: string,
  buildingId: string | null,
): Promise<boolean> {
  const [row] = await db
    .select({ id: reminders.id })
    .from(reminders)
    .where(
      and(
        eq(reminders.organizationId, organizationId),
        buildingId ? eq(reminders.buildingId, buildingId) : undefined,
        isNull(reminders.deletedAt),
      ),
    )
    .limit(1);

  return !!row;
}
