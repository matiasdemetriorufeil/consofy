import "server-only";

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { buildings, ticketEvents, tickets } from "@/db/schema";

// N = 5 días: ni tan corto que marque como "estancado" un reclamo que
// recién entró a la cola de trabajo normal de la semana (nadie revisa cada
// reclamo todos los días), ni tan largo que deje pasar casi dos semanas sin
// que nadie se entere de que algo quedó sin tocar. Cinco días es
// aproximadamente una semana hábil -- si un reclamo pendiente no tuvo
// NINGÚN cambio de estado en ese lapso, es una señal razonable de que se
// cayó del radar de alguien, sin ser tan sensible como para que la sección
// de atención inmediata esté siempre llena de casi todo lo pendiente.
export const STALE_TICKET_DAYS = 5;

type Priority = (typeof tickets.$inferSelect)["priority"];
type Status = (typeof tickets.$inferSelect)["status"];

const PENDING_STATUSES: Status[] = ["new", "in_progress"];

export type BuildingTicketSummary = {
  buildingId: string;
  buildingName: string;
  newCount: number;
  inProgressCount: number;
  pendingCount: number;
  urgentPendingCount: number;
  resolvedCount: number;
};

// La query de resumen del dashboard (paso 3.5, punto 1): UNA sola consulta
// agregada, nunca una por edificio ni una por estado -- con tres edificios
// no se nota, con quince si. El LEFT JOIN + COUNT(*) FILTER hace que
// Postgres arme los conteos por edificio en una sola pasada; un edificio
// sin ningún reclamo sigue apareciendo (con todos los conteos en 0) porque
// el LEFT JOIN no lo descarta.
//
// Solo edificios ACTIVOS (`active = true AND deleted_at IS NULL`): el
// dashboard es la vista operativa del día a día, mismo criterio que el
// selector del header -- ver CLAUDE.md > Acceso a datos sobre por qué
// "activo" es distinto de "no borrado". Un edificio pausado no debería
// reclamar atención en el panel de inicio (no puede entrar nada nuevo ahí),
// aunque su historial se siga pudiendo consultar en la sección de gestión.
//
// `buildingId`: si el selector del header tiene un edificio elegido, el
// dashboard muestra solo ese -- ver CLAUDE.md > Selector de edificio
// activo.
export async function getTicketSummaryByBuilding(
  organizationId: string,
  buildingId?: string | null,
): Promise<BuildingTicketSummary[]> {
  const rows = await db
    .select({
      buildingId: buildings.id,
      buildingName: buildings.name,
      newCount:
        sql<number>`count(*) filter (where ${tickets.status} = 'new')`.mapWith(
          Number,
        ),
      inProgressCount:
        sql<number>`count(*) filter (where ${tickets.status} = 'in_progress')`.mapWith(
          Number,
        ),
      urgentPendingCount: sql<number>`count(*) filter (
        where ${tickets.priority} = 'urgent'
        and ${tickets.status} in ('new', 'in_progress')
      )`.mapWith(Number),
      resolvedCount: sql<number>`count(*) filter (
        where ${tickets.status} in ('resolved', 'closed')
      )`.mapWith(Number),
    })
    .from(buildings)
    .leftJoin(
      tickets,
      and(
        eq(tickets.buildingId, buildings.id),
        eq(tickets.organizationId, buildings.organizationId),
      ),
    )
    .where(
      and(
        eq(buildings.organizationId, organizationId),
        eq(buildings.active, true),
        isNull(buildings.deletedAt),
        buildingId ? eq(buildings.id, buildingId) : undefined,
      ),
    )
    .groupBy(buildings.id, buildings.name)
    .orderBy(asc(buildings.name));

  return rows.map((row) => ({
    ...row,
    pendingCount: row.newCount + row.inProgressCount,
  }));
}

export type AttentionTicket = {
  id: string;
  title: string;
  publicCode: string;
  priority: Priority;
  status: Status;
  reportedAt: Date;
  lastStatusChangedAt: Date;
  buildingId: string;
  buildingName: string;
};

// Sección de atención inmediata (paso 3.5, punto 3): urgentes sin resolver
// + estancados hace más de STALE_TICKET_DAYS, de cualquier edificio (o del
// seleccionado, si hay uno). También UNA sola consulta -- el subquery
// agrupado por ticket_id (latestStatusChange) es parte del mismo plan, no
// una consulta aparte por reclamo.
//
// "Último cambio de estado": se busca en ticket_events (type =
// 'status_changed'), no en tickets.updated_at -- ese campo cambia con
// CUALQUIER edición (título, descripción, etc.), no solo con un cambio de
// estado, así que no sirve para medir esto con precisión. Si un reclamo
// nunca tuvo un evento de cambio de estado registrado, se usa reported_at
// como el último momento conocido -- es la opción conservadora: nunca
// esconde un reclamo realmente estancado, como mucho lo marca estancado
// un poco antes de lo estrictamente exacto si en algún paso futuro se
// cambia el estado sin loggear el evento correspondiente (motivo de más
// para que toda Server Action que cambie `tickets.status` también escriba
// su evento en ticket_events).
export async function getAttentionTickets(
  organizationId: string,
  buildingId?: string | null,
  staleDays: number = STALE_TICKET_DAYS,
): Promise<AttentionTicket[]> {
  // .toISOString(), no el Date crudo: interpolado directo en un fragmento
  // sql``, el driver (postgres-js) no lo serializa solo -- encontrado con
  // una prueba real (el request tiraba "The 'string' argument must be...
  // Received an instance of Date"). Con eq()/gte() de Drizzle sobre una
  // columna tipada esto no pasa (Drizzle sabe el tipo de la columna y
  // serializa por su cuenta); en un fragmento sql`` con un valor suelto,
  // hay que pasarlo ya como string.
  const staleCutoff = new Date(
    Date.now() - staleDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  // .mapWith((v) => new Date(v)) en los dos -- sql<Date> es solo una
  // anotación de TIPO para TypeScript, no convierte nada en runtime. Una
  // columna real de Drizzle (como tickets.reportedAt) sabe convertirse
  // sola a Date porque Drizzle conoce su tipo de columna; un valor
  // calculado con sql`` (max(...), coalesce(...)) no pasa por eso y
  // vuelve como el string crudo que manda el driver -- encontrado con una
  // prueba real (RelativeDate explotaba con "a.toISOString is not a
  // function" porque `date` no era un Date de verdad).
  const latestStatusChange = db
    .select({
      ticketId: ticketEvents.ticketId,
      lastStatusChangedAt: sql<Date>`max(${ticketEvents.createdAt})`
        .mapWith((v) => new Date(v))
        .as("last_status_changed_at"),
    })
    .from(ticketEvents)
    .where(eq(ticketEvents.type, "status_changed"))
    .groupBy(ticketEvents.ticketId)
    .as("latest_status_change");

  const lastChangeExpr =
    sql<Date>`coalesce(${latestStatusChange.lastStatusChangedAt}, ${tickets.reportedAt})`.mapWith(
      (v) => new Date(v),
    );

  return db
    .select({
      id: tickets.id,
      title: tickets.title,
      publicCode: tickets.publicCode,
      priority: tickets.priority,
      status: tickets.status,
      reportedAt: tickets.reportedAt,
      lastStatusChangedAt: lastChangeExpr,
      buildingId: buildings.id,
      buildingName: buildings.name,
    })
    .from(tickets)
    .innerJoin(
      buildings,
      and(
        eq(buildings.id, tickets.buildingId),
        eq(buildings.organizationId, tickets.organizationId),
      ),
    )
    .leftJoin(latestStatusChange, eq(latestStatusChange.ticketId, tickets.id))
    .where(
      and(
        eq(tickets.organizationId, organizationId),
        eq(buildings.active, true),
        isNull(buildings.deletedAt),
        inArray(tickets.status, PENDING_STATUSES),
        buildingId ? eq(tickets.buildingId, buildingId) : undefined,
        sql`(
          ${tickets.priority} = 'urgent'
          or ${lastChangeExpr} <= ${staleCutoff}
        )`,
      ),
    )
    .orderBy(sql`(${tickets.priority} = 'urgent') desc`, asc(lastChangeExpr));
}
