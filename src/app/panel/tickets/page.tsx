import { Inbox, SearchX } from "lucide-react";

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
import {
  getAssigneeFilterOptions,
  getCategoryFilterOptions,
  getStatusesForFilter,
  getTicketInbox,
  organizationHasAnyTicket,
} from "@/features/tickets/queries";
import {
  hasExplicitFilters,
  normalizeSearchParams,
  ticketInboxSearchParamsSchema,
} from "@/features/tickets/ticket-inbox-schema";
import {
  toBadgePriority,
  toBadgeStatus,
} from "@/features/tickets/status-mapping";
import { getUnitsForBuilding } from "@/features/units/queries";
import { requireUser } from "@/lib/auth";
import { zonedDayBoundsToUtc } from "@/lib/format-date";

// Bandeja de reclamos con filtros (paso 6.1) -- la pantalla donde el
// administrador vive todos los días (ver CLAUDE.md > Qué es este
// proyecto). Sin paginación todavía: eso es el paso 6.2, ver CLAUDE.md >
// Bandeja de reclamos con filtros para la medición que justifica dejarla
// para ese paso en vez de adelantarla acá.
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

  const tickets = await getTicketInbox(organization.id, {
    buildingId: filters.building,
    unitId: filters.unit,
    categoryId: filters.category,
    statuses: getStatusesForFilter(filters.status),
    priority: filters.priority,
    assignee: filters.assignee,
    dateFrom,
    dateTo,
    search: filters.q || undefined,
  });

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
        {tickets.length === 1 ? "1 reclamo" : `${tickets.length} reclamos`}
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
              <TableHead>Prioridad</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Reportado</TableHead>
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
                  {ticket.title}
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
            <p className="text-ink truncate text-sm font-medium">
              {ticket.title}
            </p>
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
    </div>
  );
}
