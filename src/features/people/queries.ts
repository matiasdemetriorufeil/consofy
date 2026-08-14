import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { people, unitOccupancies, units } from "@/db/schema";

export type BuildingPersonRow = {
  occupancyId: string;
  personId: string;
  firstName: string;
  lastName: string | null;
  phoneE164: string | null;
  email: string | null;
  role: (typeof unitOccupancies.$inferSelect)["role"];
  isPrimary: boolean;
  unitTower: string | null;
  unitFloor: string;
  unitNumber: string;
};

// Listado de solo lectura de la pestaña "Personas" (paso 4.2, punto 3):
// quiénes viven HOY en el edificio, no el historial completo de ocupantes
// que alguna vez tuvo -- por eso filtra `unit_occupancies.ended_on IS
// NULL` (ocupación vigente, ver el comentario de esa columna en
// unit-occupancies.ts). El historial de ocupantes pasados de una unidad es
// una pantalla distinta, no pedida en este paso.
//
// `unit_occupancies.organization_id` es la columna denormalizada que hace
// posible filtrar por organización sin depender de que los JOIN hayan
// llegado bien a `units`/`people` -- mismo patrón que unit_occupancies.ts
// documenta para sus FK compuestas. `buildingId` se resuelve vía
// `units.building_id` porque la ocupación en sí no sabe de qué edificio es
// (solo sabe de qué unidad).
export async function getPeopleForBuilding(
  organizationId: string,
  buildingId: string,
): Promise<BuildingPersonRow[]> {
  return db
    .select({
      occupancyId: unitOccupancies.id,
      personId: people.id,
      firstName: people.firstName,
      lastName: people.lastName,
      phoneE164: people.phoneE164,
      email: people.email,
      role: unitOccupancies.role,
      isPrimary: unitOccupancies.isPrimary,
      unitTower: units.tower,
      unitFloor: units.floor,
      unitNumber: units.number,
    })
    .from(unitOccupancies)
    .innerJoin(
      units,
      and(
        eq(units.id, unitOccupancies.unitId),
        eq(units.organizationId, unitOccupancies.organizationId),
      ),
    )
    .innerJoin(
      people,
      and(
        eq(people.id, unitOccupancies.personId),
        eq(people.organizationId, unitOccupancies.organizationId),
      ),
    )
    .where(
      and(
        eq(unitOccupancies.organizationId, organizationId),
        eq(units.buildingId, buildingId),
        isNull(unitOccupancies.endedOn),
        isNull(unitOccupancies.deletedAt),
        isNull(units.deletedAt),
        isNull(people.deletedAt),
      ),
    )
    .orderBy(asc(units.tower), asc(units.floor), asc(units.number));
}
