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
  ticketAttachments,
  ticketEvents,
  tickets,
  ticketStatus,
  units,
} from "@/db/schema";
import { zonedDayBoundsToUtc } from "@/lib/format-date";
import {
  TICKET_INBOX_PAGE_SIZE,
  UNASSIGNED_ASSIGNEE_VALUE,
  type TicketInboxSearchParams,
  type TicketSortColumn,
  type TicketSortDirection,
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

// Convierte los searchParams YA VALIDADOS (ticketInboxSearchParamsSchema)
// al shape que espera getTicketInbox() -- extraído en el paso 6.5, cuando
// apareció el segundo consumidor real: `page.tsx` ya armaba este objeto a
// mano, y las acciones masivas (actions.ts, modo "filtered" -- "todos los
// reclamos que matchean el filtro actual", no solo la página visible)
// necesitan exactamente la misma conversión, con la misma zona horaria del
// rango de fechas. Mismo criterio de extracción ya usado en el proyecto
// (AR_WHATSAPP_*, getClientIp, createSignedAttachmentUrls): se factoriza
// recién con el segundo consumidor real, no antes.
export function resolveTicketInboxFilters(
  filters: TicketInboxSearchParams,
  timezone: string,
): TicketInboxFilters {
  const dateFrom = filters.from
    ? zonedDayBoundsToUtc(filters.from, timezone).start
    : undefined;
  const dateTo = filters.to
    ? zonedDayBoundsToUtc(filters.to, timezone).end
    : undefined;

  return {
    buildingId: filters.building,
    unitId: filters.unit,
    categoryId: filters.category,
    statuses: getStatusesForFilter(filters.status),
    priority: filters.priority,
    assignee: filters.assignee,
    dateFrom,
    dateTo,
    search: filters.q || undefined,
    sortBy: filters.sort,
    sortDir: filters.dir,
  };
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
  // Paso 6.2 -- paginación y orden. `page` es 1-based (el mismo número que
  // ve el admin en la URL/UI, sin traducir a offset 0-based fuera de esta
  // función).
  sortBy?: TicketSortColumn;
  sortDir?: TicketSortDirection;
  page?: number;
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

export type TicketInboxResult = {
  rows: TicketInboxRow[];
  // Total de filas que matchean los filtros, SIN el LIMIT de la página --
  // hace falta para "Página X de Y" y para saber cuándo deshabilitar
  // "Siguiente". Sale de la MISMA consulta (`count(*) over()`, ver abajo),
  // no de un segundo round-trip -- ver CLAUDE.md > Bandeja de reclamos con
  // filtros para la medición que compara la cantidad de consultas contra
  // el paso 6.1.
  totalCount: number;
};

// Compartido entre getTicketInbox() y getTicketInboxCount() (paso 6.2, ver
// el comentario de esa segunda función sobre por qué hace falta) -- las
// mismas condiciones de filtro, sin repetirlas en dos lugares que se
// podrían desincronizar.
function buildTicketInboxConditions(
  organizationId: string,
  filters: TicketInboxFilters,
) {
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

  return conditions;
}

// La query central de la bandeja -- UNA sola consulta, con todos los joins
// y todos los filtros combinados en el mismo WHERE (AND entre sí, ver el
// reporte del paso sobre por qué AND y no OR: son filtros que ESTRECHAN la
// búsqueda, no alternativas). Nada de N+1: los joins traen edificio,
// categoría, unidad y vecino en la misma vuelta a la base, sin una consulta
// por fila -- mismo criterio que getTicketsForBuilding()/
// getAttentionTickets() de más arriba.
//
// LIMIT/OFFSET (paso 6.2, TICKET_INBOX_PAGE_SIZE) + `count(*) over()` para
// el total -- una función de ventana, no una segunda consulta `COUNT(*)`
// aparte: se computa ANTES de aplicar el LIMIT (el orden lógico de
// ejecución de SQL aplica funciones de ventana antes que LIMIT), así que
// cada fila devuelta ya trae el total real de la búsqueda completa, sin
// pagar un round-trip extra a una base que -- ver la medición del paso
// 6.1 -- ya es el costo dominante de esta pantalla.
//
// LÍMITE de este truco, encontrado probando el paso: `count(*) over()`
// SOLO viaja en filas DEVUELTAS -- con un `page` tan alto que el OFFSET
// salta más allá de todas las filas que matchean, la consulta devuelve
// CERO filas y, con ellas, ningún total tampoco (quedaría en 0, como si no
// hubiera resultados, aunque sí los haya en páginas anteriores). Por eso
// existe getTicketInboxCount() más abajo -- el caller (page.tsx) la usa
// SOLO en esa rama puntual para recuperar el total real y corregir la
// página, nunca en el camino normal.
export async function getTicketInbox(
  organizationId: string,
  filters: TicketInboxFilters,
): Promise<TicketInboxResult> {
  const conditions = buildTicketInboxConditions(organizationId, filters);

  // Página 1-based -- se traduce a offset acá adentro, no en el caller
  // (page.tsx trabaja siempre con el número que ve el admin). Sin
  // filters.page o con un valor no positivo, cae a la página 1 -- mismo
  // criterio permisivo que el resto de los filtros con una URL escrita a
  // mano.
  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const offset = (page - 1) * TICKET_INBOX_PAGE_SIZE;

  // Tiebreaker SIEMPRE presente (tickets.id): sin esto, dos reclamos con
  // exactamente la misma prioridad (lo normal -- son 4 valores para
  // potencialmente cientos de filas) o, más raro, el mismo reportedAt al
  // segundo, quedarían en un orden no determinista entre una página y la
  // siguiente -- Postgres no garantiza estabilidad de por sí. Ordenar por
  // prioridad usa reportedAt como SEGUNDO criterio (más reciente primero
  // dentro de la misma prioridad, la pregunta natural siguiente), no el id.
  const sortDirFn = filters.sortDir === "asc" ? asc : desc;
  const orderByClauses =
    filters.sortBy === "priority"
      ? [
          sortDirFn(tickets.priority),
          desc(tickets.reportedAt),
          desc(tickets.id),
        ]
      : [sortDirFn(tickets.reportedAt), desc(tickets.id)];

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
      // Función de ventana, no un segundo SELECT COUNT(*) -- ver el
      // comentario de arriba, en getTicketInbox. Se computa sobre el
      // resultado COMPLETO de filtros, antes del LIMIT de abajo.
      totalCount: sql<number>`count(*) over ()`.mapWith(Number),
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
    .orderBy(...orderByClauses)
    .limit(TICKET_INBOX_PAGE_SIZE)
    .offset(offset);

  return {
    totalCount: rows[0]?.totalCount ?? 0,
    rows: rows.map((row) => ({
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
        [row.neighborFirstName, row.neighborLastName]
          .filter(Boolean)
          .join(" ") || null,
    })),
  };
}

// Fallback puntual para el caso límite de getTicketInbox() (paso 6.2, ver
// el comentario de esa función): un `page` pedido más allá del total real
// hace que `count(*) over()` no viaje en ninguna fila (cero filas
// devueltas), así que el caller no puede saber si "cero filas" significa
// "no hay resultados" o "hay resultados, pero no en esta página". Esta
// consulta SÍ es una segunda `COUNT(*)` de verdad -- pero solo se dispara
// en esa rama puntual (bookmark viejo, filtro que acaba de reducir el
// resultado), nunca en el camino normal de la pantalla.
export async function getTicketInboxCount(
  organizationId: string,
  filters: TicketInboxFilters,
): Promise<number> {
  const conditions = buildTicketInboxConditions(organizationId, filters);
  const [row] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(tickets)
    .leftJoin(
      people,
      and(
        eq(people.id, tickets.personId),
        eq(people.organizationId, tickets.organizationId),
      ),
    )
    .where(and(...conditions));
  return row?.count ?? 0;
}

export type TicketStatusCounts = Record<Status, number>;

// Chips de conteo por estado, arriba de la bandeja (paso 6.6, redefinido --
// ver CLAUDE.md > Chips de estado sobre por qué se reemplazó el Kanban con
// drag-and-drop del enunciado original). UNA sola consulta agrupada
// (GROUP BY status), nunca una por chip -- mismo criterio que
// getTicketSummaryByBuilding (paso 3.5): un COUNT(*) FILTER o un GROUP BY
// sobre la misma pasada, no N consultas.
//
// Ignora SIEMPRE `filters.statuses` (lo pise el caller o no) -- los chips
// responden "¿cuántos hay en cada estado, dado lo demás que ya elegí?", así
// que cuentan con TODOS los filtros activos EXCEPTO el de estado. Reusa
// buildTicketInboxConditions (el mismo WHERE que arma la bandeja) para que
// "lo demás que ya elegí" nunca pueda desincronizarse de lo que la pantalla
// muestra -- mismo criterio ya aplicado en getTicketIdsForFilters (paso
// 6.5).
export async function getTicketStatusCounts(
  organizationId: string,
  filters: TicketInboxFilters,
): Promise<TicketStatusCounts> {
  const conditions = buildTicketInboxConditions(organizationId, {
    ...filters,
    statuses: undefined,
  });

  const rows = await db
    .select({
      status: tickets.status,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(tickets)
    .leftJoin(
      people,
      and(
        eq(people.id, tickets.personId),
        eq(people.organizationId, tickets.organizationId),
      ),
    )
    .where(and(...conditions))
    .groupBy(tickets.status);

  // Arranca en 0 para los cinco estados reales -- un estado sin ningún
  // ticket que matchee no aparece en las filas del GROUP BY (a diferencia
  // de un LEFT JOIN, un estado sin filas simplemente no sale), así que sin
  // esto el chip correspondiente quedaría sin conteo en vez de en "0".
  const counts = Object.fromEntries(
    ticketStatus.enumValues.map((status) => [status, 0]),
  ) as TicketStatusCounts;
  for (const row of rows) {
    counts[row.status] = row.count;
  }
  return counts;
}

// Tope de una acción masiva (paso 6.5) -- ver ticket-bulk-schema.ts para
// el razonamiento completo de por qué existe un límite. Vive acá (no solo
// en el schema) porque esta consulta es la que efectivamente lo aplica
// con un LIMIT real, no confiando en que el caller lo respete.
export const BULK_SELECTION_MAX = 500;

// Resuelve TODOS los ids que matchean el filtro actual, sin paginar --
// paso 6.5, modo "seleccionar todos los reclamos filtrados" de las
// acciones masivas. Reusa exactamente las mismas condiciones que
// getTicketInbox()/getTicketInboxCount() (mismo buildTicketInboxConditions),
// así que "todos los que matchean el filtro" es, por construcción, el
// mismo conjunto que ve el administrador escaneando la bandeja con ese
// filtro puesto -- nunca puede desincronizarse de lo que la pantalla
// muestra. `LIMIT BULK_SELECTION_MAX + 1` (no exactamente el tope): pedir
// uno de más es lo que permite distinguir "hay exactamente 500" de "hay
// más de 500" con una sola consulta, sin un COUNT(*) aparte -- el caller
// (actions.ts) decide qué hacer si la respuesta trae el excedente.
export async function getTicketIdsForFilters(
  organizationId: string,
  filters: TicketInboxFilters,
): Promise<string[]> {
  const conditions = buildTicketInboxConditions(organizationId, filters);
  const rows = await db
    .select({ id: tickets.id })
    .from(tickets)
    .leftJoin(
      people,
      and(
        eq(people.id, tickets.personId),
        eq(people.organizationId, tickets.organizationId),
      ),
    )
    .where(and(...conditions))
    .limit(BULK_SELECTION_MAX + 1);
  return rows.map((row) => row.id);
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

// -----------------------------------------------------------------------
// Vista de detalle de un reclamo (paso 6.3)
// -----------------------------------------------------------------------

export type TicketDetail = {
  id: string;
  publicCode: string;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  source: (typeof tickets.$inferSelect)["source"];
  assignee: string | null;
  reportedAt: Date;
  resolvedAt: Date | null;
  closedAt: Date | null;
  buildingId: string;
  buildingName: string;
  categoryName: string;
  unitLabel: string | null;
  // Vecino, si el reclamo tiene uno asociado (personId nullable -- ver
  // src/db/schema/tickets.ts, un reclamo cargado por el administrador sobre
  // un espacio común puede no tener detrás a una persona puntual). Trae los
  // datos directo de `people`, SIN pasar por ninguna ocupación -- a
  // propósito, ver CLAUDE.md > Pendientes ("un vecino sin ocupación es
  // invisible en el panel"): esta es la primera pantalla que muestra a ese
  // vecino sin exigirle tener una unidad asignada en ningún lado.
  neighborId: string | null;
  neighborName: string | null;
  neighborPhoneE164: string | null;
  neighborEmail: string | null;
};

// Único SELECT con todos los joins (mismo criterio que getTicketInbox): sin
// N+1, y sin exigir que el vecino tenga ninguna ocupación (LEFT JOIN contra
// people vía tickets.person_id, nunca contra unit_occupancies). `null` si
// el id no es un reclamo real de ESTA organización (de otra organización,
// uuid inventado, o dado de baja) -- el caller (page.tsx) lo traduce a
// notFound(), mismo criterio de ambigüedad ya usado en
// getBuildingDetail()/getTicketByAttachmentsToken() (no distinguir "no
// existe" de "no es tuyo").
export async function getTicketDetail(
  organizationId: string,
  ticketId: string,
): Promise<TicketDetail | null> {
  const [row] = await db
    .select({
      id: tickets.id,
      publicCode: tickets.publicCode,
      title: tickets.title,
      description: tickets.description,
      status: tickets.status,
      priority: tickets.priority,
      source: tickets.source,
      assignee: tickets.assignee,
      reportedAt: tickets.reportedAt,
      resolvedAt: tickets.resolvedAt,
      closedAt: tickets.closedAt,
      buildingId: buildings.id,
      buildingName: buildings.name,
      categoryName: categories.name,
      unitTower: units.tower,
      unitFloor: units.floor,
      unitNumber: units.number,
      unitLabelRaw: tickets.unitLabelRaw,
      neighborId: people.id,
      neighborFirstName: people.firstName,
      neighborLastName: people.lastName,
      neighborPhoneE164: people.phoneE164,
      neighborEmail: people.email,
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
    .where(
      and(
        eq(tickets.id, ticketId),
        eq(tickets.organizationId, organizationId),
        isNull(tickets.deletedAt),
      ),
    );

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    publicCode: row.publicCode,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    source: row.source,
    assignee: row.assignee,
    reportedAt: row.reportedAt,
    resolvedAt: row.resolvedAt,
    closedAt: row.closedAt,
    buildingId: row.buildingId,
    buildingName: row.buildingName,
    categoryName: row.categoryName,
    unitLabel: row.unitTower
      ? `${row.unitTower} - ${row.unitFloor}°${row.unitNumber}`
      : row.unitFloor && row.unitNumber
        ? `${row.unitFloor}°${row.unitNumber}`
        : row.unitLabelRaw,
    neighborId: row.neighborId,
    neighborName:
      [row.neighborFirstName, row.neighborLastName].filter(Boolean).join(" ") ||
      null,
    neighborPhoneE164: row.neighborPhoneE164,
    neighborEmail: row.neighborEmail,
  };
}

export type TicketDetailAttachment = {
  id: string;
  storagePath: string;
  mimeType: string;
  originalFilename: string;
  sizeBytes: number;
};

// Filtra por organizationId Y ticketId (no solo ticketId, aunque un uuid ya
// es único por sí solo): mismo patrón que el resto del archivo -- el
// filtro de organización va siempre en el WHERE de la query misma, nunca
// confiado a que el caller ya haya verificado el ticketId por otro lado
// (ver CLAUDE.md > Acceso a datos).
export async function getTicketAttachments(
  organizationId: string,
  ticketId: string,
): Promise<TicketDetailAttachment[]> {
  return db
    .select({
      id: ticketAttachments.id,
      storagePath: ticketAttachments.storagePath,
      mimeType: ticketAttachments.mimeType,
      originalFilename: ticketAttachments.originalFilename,
      sizeBytes: ticketAttachments.sizeBytes,
    })
    .from(ticketAttachments)
    .where(
      and(
        eq(ticketAttachments.ticketId, ticketId),
        eq(ticketAttachments.organizationId, organizationId),
      ),
    )
    .orderBy(asc(ticketAttachments.createdAt));
}

export type TicketTimelineEventRow = {
  id: string;
  type: (typeof ticketEvents.$inferSelect)["type"];
  actorType: (typeof ticketEvents.$inferSelect)["actorType"];
  actorLabel: string;
  payload: unknown;
  createdAt: Date;
};

// Orden cronológico ascendente (más viejo primero) -- una línea de tiempo
// se lee de arriba a abajo como pasó en la realidad, al revés que la
// bandeja (que ordena por más nuevo primero, ver CLAUDE.md > Bandeja de
// reclamos): acá el "más nuevo primero" no ayuda a entender una secuencia.
export async function getTicketTimeline(
  organizationId: string,
  ticketId: string,
): Promise<TicketTimelineEventRow[]> {
  return db
    .select({
      id: ticketEvents.id,
      type: ticketEvents.type,
      actorType: ticketEvents.actorType,
      actorLabel: ticketEvents.actorLabel,
      payload: ticketEvents.payload,
      createdAt: ticketEvents.createdAt,
    })
    .from(ticketEvents)
    .where(
      and(
        eq(ticketEvents.ticketId, ticketId),
        eq(ticketEvents.organizationId, organizationId),
      ),
    )
    .orderBy(asc(ticketEvents.createdAt));
}
