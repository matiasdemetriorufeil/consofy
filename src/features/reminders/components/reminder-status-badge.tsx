import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import {
  REMINDER_STATUS_LABEL,
  type ReminderStatusValue,
} from "../reminder-schema";

// Mismo criterio que StatusBadge de tickets (paso 6.1)/AnnouncementStatusBadge
// (paso 8.6) -- un mapa de color por estado, reusando los mismos tokens
// semánticos ya definidos en globals.css.
const REMINDER_STATUS_CLASS: Record<ReminderStatusValue, string> = {
  pending: "bg-media/10 text-media",
  notified: "bg-alta/10 text-alta",
  done: "bg-resuelto/10 text-resuelto",
  dismissed: "bg-baja/10 text-baja",
};

export function ReminderStatusBadge({
  status,
  className,
}: {
  status: ReminderStatusValue;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-body border-transparent",
        REMINDER_STATUS_CLASS[status],
        className,
      )}
    >
      {REMINDER_STATUS_LABEL[status]}
    </Badge>
  );
}
