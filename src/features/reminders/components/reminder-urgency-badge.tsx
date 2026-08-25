import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { ReminderUrgency } from "../reminder-urgency";

// Mismo criterio que ReminderStatusBadge/StatusBadge (paso 9.1/6.1) -- un
// mapa de label y un mapa de color por nivel, reusando los mismos tokens
// semánticos. Ver CLAUDE.md > Semáforo de vencimientos para los umbrales
// que definen cada nivel.
export const URGENCY_LABEL: Record<ReminderUrgency, string> = {
  overdue: "Vencido",
  upcoming: "Próximo",
  ok: "Tranquilo",
};

const URGENCY_CLASS: Record<ReminderUrgency, string> = {
  overdue: "bg-urgente/10 text-urgente",
  upcoming: "bg-alta/10 text-alta",
  ok: "bg-resuelto/10 text-resuelto",
};

export function ReminderUrgencyBadge({
  urgency,
  className,
}: {
  urgency: ReminderUrgency;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-body border-transparent",
        URGENCY_CLASS[urgency],
        className,
      )}
    >
      {URGENCY_LABEL[urgency]}
    </Badge>
  );
}

// Punto sólido de color (sin texto) -- para marcar días del calendario, más
// compacto que un Badge dentro de una celda de `--cell-size` chica.
export function ReminderUrgencyDot({
  urgency,
  className,
}: {
  urgency: ReminderUrgency;
  className?: string;
}) {
  const DOT_CLASS: Record<ReminderUrgency, string> = {
    overdue: "bg-urgente",
    upcoming: "bg-alta",
    ok: "bg-resuelto",
  };

  return (
    <span
      aria-hidden="true"
      className={cn("size-1.5 rounded-full", DOT_CLASS[urgency], className)}
    />
  );
}
