import { ArrowDown, ArrowUp, Inbox, SearchX } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { RelativeDate } from "@/components/relative-date";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getBuildingFilterOptions } from "@/features/buildings/queries";
import { PriorityBadge } from "@/features/tickets/components/priority-badge";
import { StatusBadge } from "@/features/tickets/components/status-badge";
import { TicketCode } from "@/features/tickets/components/ticket-code";
import { TicketFiltersBar } from "@/features/tickets/components/ticket-filters-bar";
import { TicketPagination } from "@/features/tickets/components/ticket-pagination";
import {
  getAssigneeFilterOptions,
  getCategoryFilterOptions,
  getStatusesForFilter,
  getTicketInbox,
  getTicketInboxCount,
  organizationHasAnyTicket,
} from "@/features/tickets/queries";
import {
  buildTicketInboxHref,
  hasExplicitFilters,
  normalizeSearchParams,
  TICKET_INBOX_PAGE_SIZE,
  ticketInboxQueryString,
  ticketInboxSearchParamsSchema,
  type TicketSortColumn,
  type TicketSortDirection,
} from "@/features/tickets/ticket-inbox-schema";
import {
  toBadgePriority,
  toBadgeStatus,
} from "@/features/tickets/status-mapping";
import { getUnitsForBuilding } from "@/features/units/queries";
import { requireUser } from "@/lib/auth";
import { zonedDayBoundsToUtc } from "@/lib/format-date";

// Bandeja de reclamos con filtros, paginación y orden (pasos 6.1 y 6.2) --
// la pantalla donde el administrador vive todos los días (ver CLAUDE.md >
// Qué es este proyecto).
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

  const dateFrom = filters.from
    ? zonedDayBoundsToUtc(filters.from, organization.timezone).start
    : undefined;
  const dateTo = filters.to
    ? zonedDayBoundsToUtc(filters.to, organization.timezone).end
    : undefined;

  const inboxFilters = {
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

  // Encabezados ordenables (paso 6.2) -- Link de Next.js puro, sin
  // Client Component: el servidor ya sabe el orden actual (filters.sort/
  // dir) y puede calcular el próximo estado (toggle si ya es esta columna,
  // "desc" si se cambia de columna) sin JS del lado del cliente. Cambiar
  // de orden también resetea la página a 1 -- mismo motivo que cualquier
  // otro cambio de filtro (ver TicketFiltersBar).
  function buildSortHref(column: TicketSortColumn): string {
    const nextDir: TicketSortDirection =
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

  // Función común (no un componente -- ver el lint react-hooks/
  // static-components: declarar un componente adentro del render de otro
  // resetea su estado en cada render) que devuelve el ícono de dirección,
  // o null si esta columna no es la que está ordenando ahora.
  function sortIndicator(column: TicketSortColumn) {
    if (filters.sort !== column) {
      return null;
    }
    return filters.dir === "desc" ? (
      <ArrowDown aria-hidden="true" className="size-3.5" />
    ) : (
      <ArrowUp aria-hidden="true" className="size-3.5" />
    );
  }

  function buildPageHref(page: number): string {
    return buildTicketInboxHref("/panel/tickets", normalizedParams, {
      page: page === 1 ? null : String(page),
    });
  }

  // Cómo se llega al detalle y cómo se vuelve sin perder filtros (paso
  // 6.3): el título de cada fila/tarjeta linkea a /panel/tickets/[id] con
  // la query actual codificada en `from` -- el detalle arma su link
  // "Volver a la bandeja" con ese valor tal cual, así que cambiar de
  // filtro/página/orden y después entrar a un reclamo y volver deja al
  // administrador exactamente donde estaba, nunca reseteado a la vista por
  // default. Mismo criterio de "la URL decide" que ya fijaron los pasos
  // 6.1/6.2, aplicado acá a la navegación entre pantallas en vez de a un
  // control dentro de la misma.
  const backQuery = ticketInboxQueryString(normalizedParams);
  function buildDetailHref(ticketId: string): string {
    return backQuery
      ? `/panel/tickets/${ticketId}?from=${encodeURIComponent(backQuery)}`
      : `/panel/tickets/${ticketId}`;
  }

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

      <p className="text-ink-muted text-sm">
        {totalCount === 1 ? "1 reclamo" : `${totalCount} reclamos`}
        {totalPages > 1 && ` · página ${effectivePage} de ${totalPages}`}
      </p>

      {/* Desktop: tabla. Mobile: tarjetas apiladas -- una tabla de 7-8
          columnas no entra en un celular sin scroll horizontal, y CLAUDE.md
          pide evitar eso (ver Responsive > wide content). Misma
          información en las dos, solo cambia el layout. */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              {showBuildingColumn && <TableHead>Edificio</TableHead>}
              <TableHead>Unidad</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Título</TableHead>
              <TableHead>
                <Link
                  href={buildSortHref("priority")}
                  className="hover:text-ink inline-flex items-center gap-1"
                >
                  Prioridad
                  {sortIndicator("priority")}
                </Link>
              </TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>
                <Link
                  href={buildSortHref("reportedAt")}
                  className="hover:text-ink inline-flex items-center gap-1"
                >
                  Reportado
                  {sortIndicator("reportedAt")}
                </Link>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.map((ticket) => (
              <TableRow key={ticket.id}>
                <TableCell>
                  <TicketCode code={ticket.publicCode} />
                </TableCell>
                {showBuildingColumn && (
                  <TableCell className="max-w-40 truncate">
                    {ticket.buildingName}
                  </TableCell>
                )}
                <TableCell className="text-ink-muted">
                  {ticket.unitLabel ?? "—"}
                </TableCell>
                <TableCell>{ticket.categoryName}</TableCell>
                <TableCell className="max-w-64 truncate">
                  <Link
                    href={buildDetailHref(ticket.id)}
                    className="outline-none hover:underline focus-visible:underline"
                  >
                    {ticket.title}
                  </Link>
                </TableCell>
                <TableCell>
                  <PriorityBadge priority={toBadgePriority(ticket.priority)} />
                </TableCell>
                <TableCell>
                  <StatusBadge status={toBadgeStatus(ticket.status)} />
                </TableCell>
                <TableCell>
                  <RelativeDate
                    date={ticket.reportedAt}
                    timezone={organization.timezone}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="flex flex-col gap-2 md:hidden">
        {tickets.map((ticket) => (
          <li
            key={ticket.id}
            className="border-border bg-surface flex flex-col gap-2 rounded-lg border p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <TicketCode code={ticket.publicCode} />
              <RelativeDate
                date={ticket.reportedAt}
                timezone={organization.timezone}
                className="text-ink-muted text-xs"
              />
            </div>
            <Link
              href={buildDetailHref(ticket.id)}
              className="text-ink truncate text-sm font-medium hover:underline"
            >
              {ticket.title}
            </Link>
            <p className="text-ink-muted truncate text-xs">
              {showBuildingColumn ? `${ticket.buildingName} · ` : ""}
              {ticket.unitLabel ?? "Sin unidad"} · {ticket.categoryName}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <PriorityBadge priority={toBadgePriority(ticket.priority)} />
              <StatusBadge status={toBadgeStatus(ticket.status)} />
            </div>
          </li>
        ))}
      </ul>

      <TicketPagination
        currentPage={effectivePage}
        totalPages={totalPages}
        buildHref={buildPageHref}
      />
    </div>
  );
}
