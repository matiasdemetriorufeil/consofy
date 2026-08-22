import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  buildings,
  categories,
  incidents,
  people,
  tickets,
  units,
} from "@/db/schema";

type IncidentStatus = (typeof incidents.$inferSelect)["status"];
type TicketStatus = (typeof tickets.$inferSelect)["status"];
type TicketPriority = (typeof tickets.$inferSelect)["priority"];

export type IncidentDetail = {
  id: string;
  title: string;
  status: IncidentStatus;
  buildingId: string;
  buildingName: string;
  categoryName: string;
  createdAt: Date;
  resolvedAt: Date | null;
};

// Detalle del incidente (paso 7.4) -- mismo criterio de ambigüedad que
// getTicketDetail/getBuildingDetail: `null` si el id no es un incidente
// real de ESTA organización (de otra organización, uuid inventado, o
// soft-borrado -- ver el caso de fusión, que deja al incidente perdedor
// con `deleted_at` seteado) o si está soft-borrado. El caller
// (page.tsx) lo traduce a notFound(), sin distinguir los tres casos --
// un incidente fusionado hacia otro no debería seguir teniendo una
// página propia navegable.
export async function getIncidentDetail(
  organizationId: string,
  incidentId: string,
): Promise<IncidentDetail | null> {
  const [row] = await db
    .select({
      id: incidents.id,
      title: incidents.title,
      status: incidents.status,
      buildingId: incidents.buildingId,
      buildingName: buildings.name,
      categoryName: categories.name,
      createdAt: incidents.createdAt,
      resolvedAt: incidents.resolvedAt,
    })
    .from(incidents)
    .innerJoin(
      buildings,
      and(
        eq(buildings.id, incidents.buildingId),
        eq(buildings.organizationId, incidents.organizationId),
      ),
    )
    .innerJoin(
      categories,
      and(
        eq(categories.id, incidents.categoryId),
        eq(categories.organizationId, incidents.organizationId),
      ),
    )
    .where(
      and(
        eq(incidents.id, incidentId),
        eq(incidents.organizationId, organizationId),
        isNull(incidents.deletedAt),
      ),
    );
  return row ?? null;
}

export type IncidentTicketRow = {
  id: string;
  publicCode: string;
  title: string;
  status: TicketStatus;
  priority: TicketPriority;
  unitLabel: string | null;
  neighborId: string | null;
  neighborName: string | null;
};

// Todos los tickets de este incidente, más viejo primero (mismo criterio
// que getTicketTimeline: leer una agrupación de arriba a abajo como pasó
// en la realidad). Un solo SELECT con los joins de unidad/vecino -- mismo
// patrón que getTicketInbox/getTicketDetail (tickets/queries.ts), sin
// N+1. `tickets_incident_id_idx` (migración de este paso) es el que
// acelera el WHERE.
export async function getIncidentTickets(
  organizationId: string,
  incidentId: string,
): Promise<IncidentTicketRow[]> {
  const rows = await db
    .select({
      id: tickets.id,
      publicCode: tickets.publicCode,
      title: tickets.title,
      status: tickets.status,
      priority: tickets.priority,
      unitTower: units.tower,
      unitFloor: units.floor,
      unitNumber: units.number,
      unitLabelRaw: tickets.unitLabelRaw,
      neighborId: people.id,
      neighborFirstName: people.firstName,
      neighborLastName: people.lastName,
    })
    .from(tickets)
    .leftJoin(
      units,
      and(
        eq(units.id, tickets.unitId),
        eq(units.organizationId, tickets.organizationId),
      ),
    )
    .leftJoin(
      people,
      and(
        eq(people.id, tickets.personId),
        eq(people.organizationId, tickets.organizationId),
      ),
    )
    .where(
      and(
        eq(tickets.incidentId, incidentId),
        eq(tickets.organizationId, organizationId),
        isNull(tickets.deletedAt),
      ),
    )
    .orderBy(asc(tickets.reportedAt));

  return rows.map((row) => ({
    id: row.id,
    publicCode: row.publicCode,
    title: row.title,
    status: row.status,
    priority: row.priority,
    unitLabel: row.unitTower
      ? `${row.unitTower} - ${row.unitFloor}°${row.unitNumber}`
      : row.unitFloor && row.unitNumber
        ? `${row.unitFloor}°${row.unitNumber}`
        : row.unitLabelRaw,
    neighborId: row.neighborId,
    neighborName:
      [row.neighborFirstName, row.neighborLastName].filter(Boolean).join(" ") ||
      null,
  }));
}
