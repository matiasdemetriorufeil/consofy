import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  sql,
} from "drizzle-orm";

import { db } from "@/db";
import {
  buildings,
  categories,
  people,
  ticketEvents,
  tickets,
  units,
} from "@/db/schema";
import {
  UNASSIGNED_ASSIGNEE_VALUE,
  type TicketStatusFilterValue,
} from "./ticket-inbox-schema";

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

export type BuildingTicketRow = {
  id: string;
  publicCode: string;
  title: string;
  status: Status;
  priority: Priority;
  reportedAt: Date;
  categoryName: string;
};

// Cuánto mostrar en la pestaña "Reclamos" de la vista de detalle de un
// edificio (paso 4.2, punto 3), sin pedir el total. Ver CLAUDE.md > Qué NO
// hacer y el propio enunciado del paso: "un edificio real puede tener...
// miles de reclamos" -- a diferencia de unidades/personas
// (getUnitsForBuilding/getPeopleForBuilding en sus features), acá SÍ hace
// falta un límite desde este mismo paso, no algo que "puede esperar":
// unidades y personas están acotadas por el tamaño físico del edificio
// (unas pocas centenas, como mucho), pero los reclamos se ACUMULAN
// indefinidamente con el tiempo -- un edificio de diez años puede tener
// miles, y no hay ningún límite natural que los mantenga chicos. Pedirlos
// todos acá sería, tarde o temprano, traer miles de filas para una pestaña
// que ni siquiera tiene todavía filtros ni orden propios (eso es la
// bandeja real, etapa 5 del plan).
//
// No es paginación real (no hay control de "página siguiente" ni cuenta el
// total): es un LIMIT simple, ordenado por más reciente primero, pensado
// para dar una idea de la actividad reciente del edificio sin arriesgar
// una consulta ni un render sin techo. Paginación de verdad le corresponde
// a la bandeja de reclamos dedicada, que va a tener sus propios filtros
// (estado, categoría, prioridad) -- construir esa UI acá, para una pestaña
// que el enunciado pide explícitamente "sin acciones... todavía", sería
// adelantarse a un paso que no es este.
export const TICKETS_PREVIEW_LIMIT = 50;

export async function getTicketsForBuilding(
  organizationId: string,
  buildingId: string,
  limit: number = TICKETS_PREVIEW_LIMIT,
): Promise<BuildingTicketRow[]> {
  return db
    .select({
      id: tickets.id,
      publicCode: tickets.publicCode,
      title: tickets.title,
      status: tickets.status,
      priority: tickets.priority,
      reportedAt: tickets.reportedAt,
      categoryName: categories.name,
    })
    .from(tickets)
    .innerJoin(
      categories,
      and(
        eq(categories.id, tickets.categoryId),
        eq(categories.organizationId, tickets.organizationId),
      ),
    )
    .where(
      and(
        eq(tickets.organizationId, organizationId),
        eq(tickets.buildingId, buildingId),
        isNull(tickets.deletedAt),
      ),
    )
    .orderBy(desc(tickets.reportedAt))
    .limit(limit);
}

// -----------------------------------------------------------------------
// Bandeja de reclamos con filtros (paso 6.1)
// -----------------------------------------------------------------------

// "open"/"all" son estados del FILTRO (ver ticket-inbox-schema.ts), no del
// enum de la base -- esto los traduce al array real que va al WHERE.
// "open" = new + in_progress (mismo PENDING_STATUSES que ya usa el resto
// del dashboard); "all" = sin filtro de estado (undefined); cualquier otro
// valor = ESE estado puntual, nada más.
export function getStatusesForFilter(
  statusFilter: TicketStatusFilterValue,
): Status[] | undefined {
  if (statusFilter === "open") {
    return PENDING_STATUSES;
  }
  if (statusFilter === "all") {
    return undefined;
  }
  return [statusFilter];
}

export type TicketInboxFilters = {
  buildingId?: string;
  unitId?: string;
  categoryId?: string;
  statuses?: Status[];
  priority?: Priority;
  // UNASSIGNED_ASSIGNEE_VALUE (sentinel) filtra por assignee IS NULL --
  // cualquier otro string filtra por igualdad exacta contra ese valor.
  assignee?: string;
  dateFrom?: Date;
  dateTo?: Date;
  search?: string;
};

export type TicketInboxRow = {
  id: string;
  publicCode: string;
  title: string;
  status: Status;
  priority: Priority;
  reportedAt: Date;
  assignee: string | null;
  buildingId: string;
  buildingName: string;
  categoryName: string;
  unitLabel: string | null;
  neighborName: string | null;
};

// La query central de la bandeja -- UNA sola consulta, con todos los joins
// y todos los filtros combinados en el mismo WHERE (AND entre sí, ver el
// reporte del paso sobre por qué AND y no OR: son filtros que ESTRECHAN la
// búsqueda, no alternativas). Nada de N+1: los joins traen edificio,
// categoría, unidad y vecino en la misma vuelta a la base, sin una consulta
// por fila -- mismo criterio que getTicketsForBuilding()/
// getAttentionTickets() de más arriba.
//
// Sin LIMIT todavía -- paso 6.2 (paginación) decide el techo real. Medido
// contra 500 reclamos (ver el reporte del paso) para saber si esto es un
// problema práctico antes de que 6.2 exista.
export async function getTicketInbox(
  organizationId: string,
  filters: TicketInboxFilters,
): Promise<TicketInboxRow[]> {
  const conditions = [
    eq(tickets.organizationId, organizationId),
    isNull(tickets.deletedAt),
  ];

  if (filters.buildingId) {
    conditions.push(eq(tickets.buildingId, filters.buildingId));
  }
  if (filters.unitId) {
    conditions.push(eq(tickets.unitId, filters.unitId));
  }
  if (filters.categoryId) {
    conditions.push(eq(tickets.categoryId, filters.categoryId));
  }
  if (filters.statuses && filters.statuses.length > 0) {
    conditions.push(inArray(tickets.status, filters.statuses));
  }
  if (filters.priority) {
    conditions.push(eq(tickets.priority, filters.priority));
  }
  if (filters.assignee === UNASSIGNED_ASSIGNEE_VALUE) {
    conditions.push(isNull(tickets.assignee));
  } else if (filters.assignee) {
    conditions.push(eq(tickets.assignee, filters.assignee));
  }
  if (filters.dateFrom) {
    conditions.push(gte(tickets.reportedAt, filters.dateFrom));
  }
  if (filters.dateTo) {
    conditions.push(lte(tickets.reportedAt, filters.dateTo));
  }
  if (filters.search) {
    // Trigram GIN (migración 0022) potencia cada uno de estos ILIKE --
    // combinados con OR, Postgres puede resolverlos con un Bitmap Or de
    // los índices individuales en vez de un seq scan. Busca sobre lo que
    // el administrador recuerda de un reclamo: qué pasó (título/
    // descripción), quién lo mandó (nombre del vecino), o el código si lo
    // tiene a mano.
    const pattern = `%${filters.search}%`;
    conditions.push(
      sql`(
        ${tickets.title} ilike ${pattern}
        or ${tickets.description} ilike ${pattern}
        or ${tickets.publicCode} ilike ${pattern}
        or ${people.firstName} ilike ${pattern}
        or ${people.lastName} ilike ${pattern}
      )`,
    );
  }

  const rows = await db
    .select({
      id: tickets.id,
      publicCode: tickets.publicCode,
      title: tickets.title,
      status: tickets.status,
      priority: tickets.priority,
      reportedAt: tickets.reportedAt,
      assignee: tickets.assignee,
      buildingId: buildings.id,
      buildingName: buildings.name,
      categoryName: categories.name,
      unitTower: units.tower,
      unitFloor: units.floor,
      unitNumber: units.number,
      unitLabelRaw: tickets.unitLabelRaw,
      neighborFirstName: people.firstName,
      neighborLastName: people.lastName,
    })
    .from(tickets)
    .innerJoin(
      buildings,
      and(
        eq(buildings.id, tickets.buildingId),
        eq(buildings.organizationId, tickets.organizationId),
      ),
    )
    .innerJoin(
      categories,
      and(
        eq(categories.id, tickets.categoryId),
        eq(categories.organizationId, tickets.organizationId),
      ),
    )
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
    .where(and(...conditions))
    .orderBy(desc(tickets.reportedAt));

  return rows.map((row) => ({
    id: row.id,
    publicCode: row.publicCode,
    title: row.title,
    status: row.status,
    priority: row.priority,
    reportedAt: row.reportedAt,
    assignee: row.assignee,
    buildingId: row.buildingId,
    buildingName: row.buildingName,
    categoryName: row.categoryName,
    unitLabel: row.unitTower
      ? `${row.unitTower} - ${row.unitFloor}°${row.unitNumber}`
      : row.unitFloor && row.unitNumber
        ? `${row.unitFloor}°${row.unitNumber}`
        : row.unitLabelRaw,
    neighborName:
      [row.neighborFirstName, row.neighborLastName].filter(Boolean).join(" ") ||
      null,
  }));
}

// Filtro-vacío vs. org-vacía (ver el reporte del paso): esta consulta
// puntual solo se dispara cuando getTicketInbox() ya devolvió cero filas,
// para distinguir "esta organización nunca tuvo un reclamo" de "los
// filtros no matchean nada". LIMIT 1, no un count -- no hace falta saber
// CUÁNTOS, alcanza con saber si existe al menos uno.
export async function organizationHasAnyTicket(
  organizationId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: tickets.id })
    .from(tickets)
    .where(
      and(
        eq(tickets.organizationId, organizationId),
        isNull(tickets.deletedAt),
      ),
    )
    .limit(1);
  return !!row;
}

export type CategoryFilterOption = {
  id: string;
  name: string;
};

// Para el filtro de categoría -- incluye categorías inactivas (mismo
// criterio que getBuildingFilterOptions: un listado de historial tiene que
// poder filtrar por una categoría que ya no se ofrece en el formulario
// público, porque reclamos VIEJOS pueden seguir referenciándola).
export async function getCategoryFilterOptions(
  organizationId: string,
): Promise<CategoryFilterOption[]> {
  return db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(
      and(
        eq(categories.organizationId, organizationId),
        isNull(categories.deletedAt),
      ),
    )
    .orderBy(asc(categories.sortOrder), asc(categories.name));
}

// Responsables reales, no una lista fija: `assignee` es texto libre (ver
// src/db/schema/tickets.ts -- todavía no existe una tabla de usuarios del
// panel), así que las opciones del filtro son los valores DISTINCT que ya
// se usaron en reclamos de esta organización, no un catálogo aparte.
// `DISTINCT` sobre una sola columna, ya filtrada por organización y sin
// borrados -- barato incluso con miles de reclamos (el conjunto de
// responsables reales de un edificio chico es chico, aunque el historial
// de reclamos sea grande).
export async function getAssigneeFilterOptions(
  organizationId: string,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ assignee: tickets.assignee })
    .from(tickets)
    .where(
      and(
        eq(tickets.organizationId, organizationId),
        isNull(tickets.deletedAt),
        isNotNull(tickets.assignee),
      ),
    )
    .orderBy(asc(tickets.assignee));

  return rows.map((r) => r.assignee).filter((a): a is string => a !== null);
}
