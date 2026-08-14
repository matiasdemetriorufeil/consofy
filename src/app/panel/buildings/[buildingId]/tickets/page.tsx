import { Inbox } from "lucide-react";

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
import { PriorityBadge } from "@/features/tickets/components/priority-badge";
import { StatusBadge } from "@/features/tickets/components/status-badge";
import { TicketCode } from "@/features/tickets/components/ticket-code";
import {
  getTicketsForBuilding,
  TICKETS_PREVIEW_LIMIT,
} from "@/features/tickets/queries";
import {
  toBadgePriority,
  toBadgeStatus,
} from "@/features/tickets/status-mapping";
import { requireUser } from "@/lib/auth";

// Listado de solo lectura (paso 4.2, punto 3) -- los reclamos MÁS
// RECIENTES de este edificio, no todos: ver el razonamiento completo en
// TICKETS_PREVIEW_LIMIT (src/features/tickets/queries.ts) sobre por qué
// acá sí hace falta un límite desde este mismo paso. Sin alta ni edición
// todavía (eso es la bandeja real, etapa 5).
export default async function BuildingTicketsPage({
  params,
}: PageProps<"/panel/buildings/[buildingId]/tickets">) {
  const { organization } = await requireUser();
  const { buildingId } = await params;

  const tickets = await getTicketsForBuilding(organization.id, buildingId);

  if (tickets.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="Todavía no hay reclamos cargados"
        description="Los reclamos de este edificio van a aparecer acá apenas se cargue el primero."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Título</TableHead>
            <TableHead>Categoría</TableHead>
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
              <TableCell className="max-w-64 truncate">
                {ticket.title}
              </TableCell>
              <TableCell>{ticket.categoryName}</TableCell>
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
      {tickets.length === TICKETS_PREVIEW_LIMIT && (
        <p className="text-ink-muted text-sm">
          Mostrando los {TICKETS_PREVIEW_LIMIT} reclamos más recientes.
        </p>
      )}
    </div>
  );
}
