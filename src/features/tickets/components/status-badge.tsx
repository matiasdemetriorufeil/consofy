import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type TicketStatus =
  "abierto" | "en_progreso" | "resuelto" | "cerrado" | "descartado";

// Exportado (paso 6.3): describeTicketEvent (ticket-event-description.ts)
// reusa este mapa para traducir un payload de "status_changed" (from/to en
// inglés, valores reales del enum) al mismo vocabulario que ya usa el
// badge, en vez de mantener una segunda copia de estos cinco strings.
export const STATUS_LABEL: Record<TicketStatus, string> = {
  abierto: "Abierto",
  en_progreso: "En progreso",
  resuelto: "Resuelto",
  cerrado: "Cerrado",
  descartado: "Descartado",
};

const STATUS_CLASS: Record<TicketStatus, string> = {
  abierto: "bg-media/10 text-media",
  en_progreso: "bg-alta/10 text-alta",
  resuelto: "bg-resuelto/10 text-resuelto",
  cerrado: "bg-baja/10 text-baja",
  // Mismo tono gris que "cerrado" -- las dos son estados terminales sin
  // acción pendiente, la diferencia es semántica (se resolvió vs. se
  // decidió no atenderlo), no algo que necesite un color propio.
  descartado: "bg-baja/10 text-baja",
};

interface StatusBadgeProps {
  status: TicketStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-body border-transparent",
        STATUS_CLASS[status],
        className,
      )}
    >
      {STATUS_LABEL[status]}
    </Badge>
  );
}
