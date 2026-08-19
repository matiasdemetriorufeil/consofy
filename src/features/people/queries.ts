import "server-only";

import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { people, tickets, unitOccupancies, units } from "@/db/schema";

export type BuildingOccupancyRow = {
  occupancyId: string;
  personId: string;
  firstName: string;
  lastName: string | null;
  phoneE164: string | null;
  email: string | null;
  notes: string | null;
  role: (typeof unitOccupancies.$inferSelect)["role"];
  isPrimary: boolean;
  startedOn: string;
  endedOn: string | null;
  unitId: string;
  unitTower: string | null;
  unitFloor: string;
  unitNumber: string;
};

// ABM de personas (paso 4.4), sobre el listado de solo lectura del paso
// 4.2. A diferencia de getPeopleForBuilding() (versión anterior, solo
// vigentes), esta trae TODAS las ocupaciones del edificio -- vigentes Y
// finalizadas (decisión 3 del reporte, "cómo se muestra el historial"): sin
// filtrar por `ended_on`, cada fila ya trae `startedOn`/`endedOn` para que
// la UI distinga una de otra (badge "Vigente" vs. "Finalizada"), en vez de
// tener dos consultas separadas para el mismo listado.
//
// `unit_occupancies.organization_id` es la columna denormalizada que hace
// posible filtrar por organización sin depender de que los JOIN hayan
// llegado bien a `units`/`people` -- mismo patrón que unit-occupancies.ts
// documenta para sus FK compuestas. `buildingId` se resuelve vía
// `units.building_id` porque la ocupación en sí no sabe de qué edificio es
// (solo sabe de qué unidad).
//
// Sin filtrar `isNull(units.deletedAt)`: una unidad dada de baja (paso 4.3)
// puede seguir teniendo ocupaciones históricas reales -- ocultarlas acá
// borraría historial real de la vista, no solo "lo que ya no está activo".
// `isNull(people.deletedAt)` SÍ filtra (ver la decisión 2 del reporte: una
// persona dada de baja deja de aparecer en cualquier listado normal, sin
// importar qué ocupaciones tenga).
export async function getOccupancyRowsForBuilding(
  organizationId: string,
  buildingId: string,
): Promise<BuildingOccupancyRow[]> {
  return db
    .select({
      occupancyId: unitOccupancies.id,
      personId: people.id,
      firstName: people.firstName,
      lastName: people.lastName,
      phoneE164: people.phoneE164,
      email: people.email,
      notes: people.notes,
      role: unitOccupancies.role,
      isPrimary: unitOccupancies.isPrimary,
      startedOn: unitOccupancies.startedOn,
      endedOn: unitOccupancies.endedOn,
      unitId: units.id,
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
        isNull(unitOccupancies.deletedAt),
        isNull(people.deletedAt),
      ),
    )
    .orderBy(
      // Vigentes primero (ended_on IS NULL ordena antes que cualquier
      // fecha en NULLS FIRST... pero el default de Postgres para DESC ya es
      // NULLS FIRST, así que alcanza con desc(endedOn)), después la más
      // reciente finalizada primero.
      desc(unitOccupancies.endedOn),
      desc(unitOccupancies.startedOn),
    );
}

export type PersonPhoneMatch = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
};

// Búsqueda por teléfono dentro de la organización (decisión 1 del reporte,
// "cómo evitar cargar a la misma persona dos veces"): usa exactamente el
// índice único parcial que ya define la unicidad real
// (people_organization_id_phone_e164_unique, ver people.ts) --
// `organization_id` como columna líder lo sirve directo, sin escanear de
// más. `phoneE164` ya llega normalizado (mismo formato que se guarda) desde
// el caller.
export async function findPersonByPhone(
  organizationId: string,
  phoneE164: string,
): Promise<PersonPhoneMatch | null> {
  const [row] = await db
    .select({
      id: people.id,
      firstName: people.firstName,
      lastName: people.lastName,
      email: people.email,
    })
    .from(people)
    .where(
      and(
        eq(people.organizationId, organizationId),
        eq(people.phoneE164, phoneE164),
        isNull(people.deletedAt),
      ),
    );

  return row ?? null;
}

// Contraparte de findPersonByPhone() para la reactivación del paso 5.5: si
// nadie ACTIVO tiene este teléfono, ¿hay una ficha DADA DE BAJA con el
// mismo? (ver CLAUDE.md > Pendientes, resuelto en el paso 5.5 -- opción 2,
// "revivir la ficha anterior"). `orderBy(desc(deletedAt)).limit(1)`: puede
// haber más de una ficha borrada con el mismo teléfono a lo largo del
// tiempo (el índice único parcial solo exige unicidad entre las ACTIVAS,
// nunca entre borradas) -- la más recientemente dada de baja es la mejor
// candidata a ser "la misma persona volviendo", no cualquiera del
// historial.
export async function findDeletedPersonByPhone(
  organizationId: string,
  phoneE164: string,
): Promise<{ id: string } | null> {
  const [row] = await db
    .select({ id: people.id })
    .from(people)
    .where(
      and(
        eq(people.organizationId, organizationId),
        eq(people.phoneE164, phoneE164),
        isNotNull(people.deletedAt),
      ),
    )
    .orderBy(desc(people.deletedAt))
    .limit(1);

  return row ?? null;
}

// Versión en lote de findPersonByPhone() (paso 4.5, importación CSV): un
// archivo de hasta IMPORT_MAX_ROWS filas puede traer cientos de teléfonos
// distintos para buscar -- llamar a findPersonByPhone() una vez por fila
// sería exactamente el N+1 que el proyecto evita en todo lado (ver el
// comentario de getExistingUnitKeys() en units/queries.ts para el mismo
// razonamiento aplicado a unidades). Una sola consulta con `inArray` para
// el archivo entero. `phones` ya llega normalizado (mismo formato que se
// guarda) desde el caller.
export async function findPeopleByPhones(
  organizationId: string,
  phones: string[],
): Promise<Map<string, PersonPhoneMatch>> {
  if (phones.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      id: people.id,
      firstName: people.firstName,
      lastName: people.lastName,
      email: people.email,
      phoneE164: people.phoneE164,
    })
    .from(people)
    .where(
      and(
        eq(people.organizationId, organizationId),
        inArray(people.phoneE164, phones),
        isNull(people.deletedAt),
      ),
    );

  return new Map(
    rows
      .filter(
        (row): row is typeof row & { phoneE164: string } => !!row.phoneE164,
      )
      .map((row) => [
        row.phoneE164,
        {
          id: row.id,
          firstName: row.firstName,
          lastName: row.lastName,
          email: row.email,
        },
      ]),
  );
}

export type BuildingOngoingOccupancy = {
  unitId: string;
  personId: string;
  isPrimary: boolean;
};

// Para la importación CSV (paso 4.5): trae, en UNA consulta, todas las
// ocupaciones VIGENTES del edificio -- lo que hace falta para chequear,
// fila por fila y sin ir a la base de nuevo por cada una, si "esta persona
// ya tiene una ocupación vigente en esta unidad" (el constraint que se
// endureció al cierre del paso 4.4,
// unit_occupancies_unit_person_ongoing_unique) y si "esta unidad ya tiene
// un contacto principal vigente" (para avisar en la previsualización que
// importar una fila marcada como principal va a reemplazarlo, no para
// bloquearla -- el alta real, en la segunda entrega de este paso, hace el
// mismo desmarcado atómico que ya hace createPersonWithOccupancyAction).
export async function getBuildingOngoingOccupancies(
  organizationId: string,
  buildingId: string,
): Promise<BuildingOngoingOccupancy[]> {
  return db
    .select({
      unitId: unitOccupancies.unitId,
      personId: unitOccupancies.personId,
      isPrimary: unitOccupancies.isPrimary,
    })
    .from(unitOccupancies)
    .innerJoin(
      units,
      and(
        eq(units.id, unitOccupancies.unitId),
        eq(units.organizationId, unitOccupancies.organizationId),
      ),
    )
    .where(
      and(
        eq(unitOccupancies.organizationId, organizationId),
        eq(units.buildingId, buildingId),
        isNull(unitOccupancies.endedOn),
        isNull(unitOccupancies.deletedAt),
      ),
    );
}

// Defensa en profundidad para la asignación a unidad (paso 4.4): igual que
// `buildingId` en el WHERE de softDeleteUnitAction (units/actions.ts), no
// cambia qué filas puede tocar alguien de otra organización
// (`organizationId` ya alcanza para eso), pero evita que un estado de
// cliente desactualizado (una unidad que ya no es de este edificio, o que
// se dio de baja) termine asignando un vecino a una unidad donde no
// corresponde.
export async function unitBelongsToBuilding(
  organizationId: string,
  buildingId: string,
  unitId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: units.id })
    .from(units)
    .where(
      and(
        eq(units.id, unitId),
        eq(units.organizationId, organizationId),
        eq(units.buildingId, buildingId),
        isNull(units.deletedAt),
      ),
    );

  return !!row;
}

export type PersonDependencyCounts = {
  activeOccupanciesCount: number;
  pendingTicketsCount: number;
};

// Para el diálogo de baja de una PERSONA (paso 4.4, decisión 2): a
// diferencia de getUnitDependencyCounts() (units/queries.ts, acotado a UNA
// unidad), acá se cuenta en TODA la organización -- dar de baja a una
// persona la saca de todo listado normal sin importar en qué edificio esté,
// así que lo que hay que advertir es su situación completa, no solo la de
// este edificio. Ocupaciones VIGENTES (ended_on IS NULL) y reclamos
// pendientes (new/in_progress), mismo criterio que unidades.
export async function getPersonDependencyCounts(
  organizationId: string,
  personId: string,
): Promise<PersonDependencyCounts> {
  const [occupancies] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(unitOccupancies)
    .where(
      and(
        eq(unitOccupancies.organizationId, organizationId),
        eq(unitOccupancies.personId, personId),
        isNull(unitOccupancies.endedOn),
        isNull(unitOccupancies.deletedAt),
      ),
    );

  const [pendingTickets] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(tickets)
    .where(
      and(
        eq(tickets.organizationId, organizationId),
        eq(tickets.personId, personId),
        inArray(tickets.status, ["new", "in_progress"]),
        isNull(tickets.deletedAt),
      ),
    );

  return {
    activeOccupanciesCount: occupancies?.count ?? 0,
    pendingTicketsCount: pendingTickets?.count ?? 0,
  };
}
