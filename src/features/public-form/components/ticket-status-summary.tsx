import { RelativeDate } from "@/components/relative-date";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import {
  PUBLIC_TICKET_STATUS_LABEL,
  type PublicTicketStatus,
} from "../status-lookup-schema";

// Confirmación de un reclamo para el vecino por la vía DÉBIL (paso 11.1,
// public_code tipeado a mano) -- lo MÍNIMO para que reconozca "sí, es
// este": estado, categoría, edificio/unidad y fecha de reporte. NADA de
// título ni descripción (ambos derivan de texto libre del vecino, ver
// status-lookup-schema.ts), nombre de quien reportó, fotos, asignado ni
// notas. La vista completa (línea de tiempo) es 11.2.
//
// Server Components puros. `PublicTicketStatusBadge` lo reusa también
// `/s/[token]` (vía por link, token no adivinable: ahí SÍ se muestran
// título y descripción, ese riesgo no aplica). `TicketStatusSummary` lo
// usa el resultado del formulario de `/r/[token]/estado`, donde no hay
// nada más en pantalla.

// Mismos tonos semánticos que el badge del panel (STATUS_CLASS en
// tickets/components/status-badge.tsx), mapeados desde el enum REAL de la
// base y con el vocabulario público.
const STATUS_TONE: Record<PublicTicketStatus["status"], string> = {
  new: "bg-media/10 text-media",
  in_progress: "bg-alta/10 text-alta",
  resolved: "bg-resuelto/10 text-resuelto",
  closed: "bg-baja/10 text-baja",
  discarded: "bg-baja/10 text-baja",
};

export function PublicTicketStatusBadge({
  status,
}: {
  status: PublicTicketStatus["status"];
}) {
  return (
    <Badge
      variant="outline"
      className={cn("border-transparent", STATUS_TONE[status])}
    >
      {PUBLIC_TICKET_STATUS_LABEL[status]}
    </Badge>
  );
}

export function TicketStatusSummary({
  ticket,
}: {
  ticket: PublicTicketStatus;
}) {
  const unitAndBuilding = ticket.unitLabel
    ? `${ticket.buildingName} · ${ticket.unitLabel}`
    : ticket.buildingName;

  return (
    <dl className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <dt className="text-ink-muted text-xs">Estado</dt>
        <dd>
          <PublicTicketStatusBadge status={ticket.status} />
        </dd>
      </div>

      {/* Categoría en lugar del título: por esta vía (código adivinable) no
          se muestra el título, que se deriva de la descripción libre del
          vecino -- ver PublicTicketStatus. La categoría es un enum fijo y
          alcanza para reconocer el reclamo. */}
      <div className="flex flex-col gap-1">
        <dt className="text-ink-muted text-xs">Categoría</dt>
        <dd className="text-ink text-sm font-medium">{ticket.categoryName}</dd>
      </div>

      <div className="flex flex-col gap-1">
        <dt className="text-ink-muted text-xs">Edificio</dt>
        <dd className="text-ink text-sm">{unitAndBuilding}</dd>
      </div>

      <div className="flex flex-col gap-1">
        <dt className="text-ink-muted text-xs">Reportado</dt>
        <dd className="text-ink text-sm">
          <RelativeDate
            date={ticket.reportedAt}
            timezone={ticket.organizationTimezone}
          />
        </dd>
      </div>
    </dl>
  );
}
