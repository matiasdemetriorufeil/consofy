import Link from "next/link";

import { cn } from "@/lib/utils";

import type { TicketStatusCounts } from "../queries";
import { toBadgeStatus } from "../status-mapping";
import type { TicketStatusFilterValue } from "../ticket-inbox-schema";
import { STATUS_LABEL } from "./status-badge";

// Los cinco estados reales del enum, en el mismo orden narrativo que ya usa
// la tabla de transiciones del paso 6.4 (new -> in_progress -> resolved ->
// closed, con discarded al final por ser un estado terminal fuera de esa
// línea) -- no el orden de TICKET_STATUS_FILTER_VALUES, que antepone
// "open"/"all" (sentinels del filtro, no estados reales de la base).
const CHIP_STATUSES = [
  "new",
  "in_progress",
  "resolved",
  "closed",
  "discarded",
] as const;

type ChipStatus = (typeof CHIP_STATUSES)[number];

type Props = {
  counts: TicketStatusCounts;
  activeStatus: TicketStatusFilterValue;
  buildHref: (status: "all" | ChipStatus) => string;
};

// Paso 6.6 (redefinido -- ver CLAUDE.md > Chips de estado): reemplaza el
// Kanban con drag-and-drop del enunciado original. Server Component puro,
// mismo criterio que buildSortHref/buildPageHref en page.tsx: el servidor
// ya conoce filtros y conteos al renderizar, así que aplicar un chip es un
// <Link> con el href ya resuelto, sin Client Component ni librería de
// drag-and-drop nueva.
export function TicketStatusChips({ counts, activeStatus, buildHref }: Props) {
  const total = CHIP_STATUSES.reduce((sum, status) => sum + counts[status], 0);

  return (
    <nav
      aria-label="Filtrar reclamos por estado"
      className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"
    >
      <ul className="flex w-max min-w-full gap-2 sm:flex-wrap">
        <StatusChip
          href={buildHref("all")}
          label="Todos"
          count={total}
          active={activeStatus === "all"}
        />
        {CHIP_STATUSES.map((status) => (
          <StatusChip
            key={status}
            href={buildHref(status)}
            label={STATUS_LABEL[toBadgeStatus(status)]}
            count={counts[status]}
            active={activeStatus === status}
          />
        ))}
      </ul>
    </nav>
  );
}

function StatusChip({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active || undefined}
        className={cn(
          "border-border text-ink-muted hover:bg-muted hover:text-ink focus-visible:ring-ring/50 inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3",
          active &&
            "border-primary bg-primary text-primary-foreground hover:bg-primary/80 hover:text-primary-foreground",
        )}
      >
        {label}
        <span
          className={cn(
            "text-xs tabular-nums",
            active ? "text-primary-foreground/80" : "text-ink-muted",
          )}
        >
          {count}
        </span>
      </Link>
    </li>
  );
}
