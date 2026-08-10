import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type TicketStatus = "abierto" | "en_progreso" | "resuelto" | "cerrado";

const STATUS_LABEL: Record<TicketStatus, string> = {
  abierto: "Abierto",
  en_progreso: "En progreso",
  resuelto: "Resuelto",
  cerrado: "Cerrado",
};

const STATUS_CLASS: Record<TicketStatus, string> = {
  abierto: "bg-media/10 text-media",
  en_progreso: "bg-alta/10 text-alta",
  resuelto: "bg-resuelto/10 text-resuelto",
  cerrado: "bg-baja/10 text-baja",
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
