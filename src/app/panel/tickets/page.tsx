import { Inbox, SearchX } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { getBuildingFilterOptions } from "@/features/buildings/queries";
import { TicketFiltersBar } from "@/features/tickets/components/ticket-filters-bar";
import { TicketInboxList } from "@/features/tickets/components/ticket-inbox-list";
import { TicketPagination } from "@/features/tickets/components/ticket-pagination";
import { TicketStatusChips } from "@/features/tickets/components/ticket-status-chips";
import {
  getAssigneeFilterOptions,
  getCategoryFilterOptions,
  getTicketInbox,
  getTicketInboxCount,
  getTicketStatusCounts,
  organizationHasAnyTicket,
  resolveTicketInboxFilters,
} from "@/features/tickets/queries";
import {
  buildTicketInboxHref,
  hasExplicitFilters,
  normalizeSearchParams,
  TICKET_INBOX_PAGE_SIZE,
  ticketInboxQueryString,
  ticketInboxSearchParamsSchema,
  type TicketStatusFilterValue,
} from "@/features/tickets/ticket-inbox-schema";
import { getUnitsForBuilding } from "@/features/units/queries";
import { requireUser } from "@/lib/auth";

// Bandeja de reclamos con filtros, paginación, orden (pasos 6.1/6.2) y
// selección para acciones masivas (paso 6.5) -- la pantalla donde el
// administrador vive todos los días (ver CLAUDE.md > Qué es este
// proyecto). Sigue siendo un Server Component en su mayor parte -- solo la
// selección de filas y la barra de acciones masivas (TicketInboxList) son
// Client Component, ver el comentario de ese archivo sobre por qué.
export default async function TicketsPage({
  searchParams,
}: PageProps<"/panel/tickets">) {
  const { organization } = await requireUser();
  const rawParams = await searchParams;
  const parsed = ticketInboxSearchParamsSchema.safeParse(
    normalizeSearchParams(rawParams),
  );
  // No debería pasar en el uso normal (la URL la arma nuestro propio
  // filtro, nunca un <form> de terceros), pero una URL escrita a mano con
  // un valor inválido (`?priority=banana`) no tiene por qué romper la
  // pantalla -- cae a los defaults del schema, mismo criterio que el resto
  // del proyecto trata cualquier entrada no confiable.
  const filters = parsed.success
    ? parsed.data
    : ticketInboxSearchParamsSchema.parse({});

  const normalizedParams = normalizeSearchParams(rawParams);
  const explicitFilters = hasExplicitFilters(normalizedParams);

  const [buildingOptions, categoryOptions, assigneeOptions] = await Promise.all(
    [
      getBuildingFilterOptions(organization.id),
      getCategoryFilterOptions(organization.id),
      getAssigneeFilterOptions(organization.id),
    ],
  );

  // Unidades de ESE edificio, solo si hay uno elegido -- filtrar por
  // unidad sin edificio no tiene un <select> con el que alimentarse (ver
  // CLAUDE.md > Bandeja de reclamos con filtros).
  const unitOptions = filters.building
    ? await getUnitsForBuilding(organization.id, filters.building)
    : [];

  const inboxFilters = resolveTicketInboxFilters(
    filters,
    organization.timezone,
  );

  let { rows: tickets, totalCount } = await getTicketInbox(organization.id, {
    ...inboxFilters,
    page: filters.page,
  });

  let totalPages = Math.max(1, Math.ceil(totalCount / TICKET_INBOX_PAGE_SIZE));
  let effectivePage = filters.page;

  // Cero filas Y se pidió una página más allá de la primera: puede ser un
  // bookmark viejo o un filtro que acaba de reducir el resultado mientras
  // el admin estaba en una página alta -- pero `count(*) over()` (ver el
  // comentario de getTicketInbox) NO viaja en ninguna fila cuando el
  // offset pedido salta más allá del total real, así que acá no hay forma
  // de distinguir "no hay resultados de verdad" de "hay resultados, nomás
  // que no en esta página" sin preguntar aparte. getTicketInboxCount()
  // resuelve la duda -- SOLO en esta rama puntual, nunca en el camino
  // normal (page 1, o una página que sí tiene filas).
  if (tickets.length === 0 && filters.page > 1) {
    const realTotal = await getTicketInboxCount(organization.id, inboxFilters);
    totalPages = Math.max(1, Math.ceil(realTotal / TICKET_INBOX_PAGE_SIZE));
    if (realTotal > 0) {
      effectivePage = totalPages;
      ({ rows: tickets, totalCount } = await getTicketInbox(organization.id, {
        ...inboxFilters,
        page: effectivePage,
      }));
    } else {
      totalCount = 0;
    }
  }

  const showBuildingColumn = !filters.building;

  if (tickets.length === 0) {
    // Tres estados vacíos distintos, no uno solo -- ver CLAUDE.md > Bandeja
    // de reclamos con filtros para la justificación completa de por qué
    // importa distinguirlos.
    if (!explicitFilters) {
      const hasAnyTicket = await organizationHasAnyTicket(organization.id);
      if (!hasAnyTicket) {
        return (
          <EmptyState
            icon={Inbox}
            title="Todavía no hay reclamos cargados"
            description="Acá va a aparecer la bandeja de reclamos de los vecinos, con su estado y prioridad, apenas alguien cargue el primero desde el formulario público."
          />
        );
      }
      return (
        <EmptyState
          icon={Inbox}
          title="No hay reclamos abiertos"
          description="Todos los reclamos están resueltos, cerrados o descartados. Podés ver el historial completo cambiando el filtro de estado."
        />
      );
    }
    return (
      <EmptyState
        icon={SearchX}
        title="No encontramos reclamos con estos filtros"
        description="Probá ampliar el rango de fechas o sacar alguno de los filtros elegidos."
        action={{ label: "Limpiar filtros", href: "/panel/tickets" }}
      />
    );
  }

  // Encabezados ordenables (paso 6.2) -- hrefs resueltos server-side
  // (el servidor ya sabe el orden actual) y pasados como string a
  // TicketInboxList, que es Client Component desde el paso 6.5 (ver ese
  // archivo) -- ya no puede calcularlos por su cuenta con la misma lógica
  // "sin JS" del Server Component original, pero el cálculO EN SÍ sigue
  // pasando acá, server-side; el cliente solo recibe el resultado.
  function buildSortHref(column: "priority" | "reportedAt"): string {
    const nextDir =
      filters.sort === column
        ? filters.dir === "desc"
          ? "asc"
          : "desc"
        : "desc";
    return buildTicketInboxHref("/panel/tickets", normalizedParams, {
      sort: column === "reportedAt" ? null : column,
      dir: nextDir === "desc" ? null : nextDir,
      page: null,
    });
  }

  function buildPageHref(page: number): string {
    return buildTicketInboxHref("/panel/tickets", normalizedParams, {
      page: page === 1 ? null : String(page),
    });
  }

  // Chips de estado (paso 6.6, redefinido) -- mismo mecanismo de URL que el
  // resto de los filtros (buildTicketInboxHref), nunca uno aparte. `page`
  // siempre a null: tocar un chip es un cambio de filtro, y cambiar
  // cualquier filtro vuelve a la página 1 (mismo criterio que
  // buildSortHref de arriba y que TicketFiltersBar.updateParams).
  function buildStatusChipHref(
    status: Exclude<TicketStatusFilterValue, "open">,
  ): string {
    return buildTicketInboxHref("/panel/tickets", normalizedParams, {
      status,
      page: null,
    });
  }

  // Conteos por estado con TODOS los filtros activos EXCEPTO el de estado
  // (getTicketStatusCounts los ignora siempre, ver queries.ts) -- una sola
  // consulta agrupada, disparada solo acá (no en las ramas de empty state
  // de arriba, que ya cortan antes de mostrar la tabla y los chips).
  const statusCounts = await getTicketStatusCounts(
    organization.id,
    inboxFilters,
  );

  // Cómo se llega al detalle y cómo se vuelve sin perder filtros (paso
  // 6.3): viaja como string a TicketInboxList, que arma cada link de
  // título con esto -- ver el comentario original de esta idea en el
  // reporte del paso 6.3.
  const backQuery = ticketInboxQueryString(normalizedParams);

  return (
    <div className="flex flex-col gap-4">
      <TicketFiltersBar
        buildingOptions={buildingOptions}
        unitOptions={unitOptions}
        categoryOptions={categoryOptions}
        assigneeOptions={assigneeOptions}
        current={{
          building: filters.building ?? null,
          unit: filters.unit ?? null,
          category: filters.category ?? null,
          status: filters.status,
          priority: filters.priority ?? null,
          assignee: filters.assignee ?? null,
          from: filters.from ?? null,
          to: filters.to ?? null,
          q: filters.q || null,
          sort: filters.sort,
          dir: filters.dir,
        }}
        activeFilterCount={
          [
            filters.building,
            filters.unit,
            filters.category,
            filters.status !== "open" ? filters.status : undefined,
            filters.priority,
            filters.assignee,
            filters.from,
            filters.to,
            filters.q,
          ].filter(Boolean).length
        }
      />

      <TicketStatusChips
        counts={statusCounts}
        activeStatus={filters.status}
        buildHref={buildStatusChipHref}
      />

      <p className="text-ink-muted text-sm">
        {totalCount === 1 ? "1 reclamo" : `${totalCount} reclamos`}
        {totalPages > 1 && ` · página ${effectivePage} de ${totalPages}`}
      </p>

      <TicketInboxList
        tickets={tickets}
        showBuildingColumn={showBuildingColumn}
        organizationTimezone={organization.timezone}
        backQuery={backQuery}
        activeSort={filters.sort}
        activeDir={filters.dir}
        sortHrefs={{
          priority: buildSortHref("priority"),
          reportedAt: buildSortHref("reportedAt"),
        }}
        assigneeOptions={assigneeOptions}
        totalCount={totalCount}
        rawFilters={normalizedParams}
      />

      <TicketPagination
        currentPage={effectivePage}
        totalPages={totalPages}
        buildHref={buildPageHref}
      />
    </div>
  );
}
