import Link from "next/link";

import { RelativeDate } from "@/components/relative-date";

import { getAttentionTickets } from "../queries";
import { toBadgePriority, toBadgeStatus } from "../status-mapping";
import { PriorityBadge } from "./priority-badge";
import { StatusBadge } from "./status-badge";

// Async Server Component, pensado para vivir dentro de un <Suspense> (ver
// panel/page.tsx) -- es la parte "lenta" del dashboard (paso 3.5, punto 6).
export async function AttentionSection({
  organizationId,
  buildingId,
  timezone,
}: {
  organizationId: string;
  buildingId: string | null;
  timezone: string;
}) {
  const attentionTickets = await getAttentionTickets(
    organizationId,
    buildingId,
  );

  return (
    <section
      aria-labelledby="attention-heading"
      className="flex flex-col gap-3"
    >
      <h2
        id="attention-heading"
        className="text-ink font-display text-lg font-semibold"
      >
        Atención inmediata
      </h2>
      {attentionTickets.length === 0 ? (
        // Vacío bueno, acotado a esta sección puntual (paso 3.5, punto 4):
        // sin celebrar de más, una sola línea que confirma que no hay nada
        // urgente ni estancado -- no es lo mismo que "no hay NINGÚN
        // reclamo pendiente" (eso lo dice BuildingSummaryCards, con su
        // propia información).
        <p className="text-ink-muted text-sm">
          Nada urgente ni estancado por ahora.
        </p>
      ) : (
        <ul className="border-border bg-surface divide-border flex flex-col divide-y rounded-lg border">
          {attentionTickets.map((ticket) => (
            <li key={ticket.id}>
              <Link
                href={`/panel/tickets?building=${ticket.buildingId}&status=${ticket.status}`}
                className="hover:bg-secondary focus-visible:bg-secondary focus-visible:ring-ring/50 flex flex-col gap-1.5 px-4 py-3 outline-none focus-visible:ring-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-ink text-sm font-medium">
                    {ticket.title}
                  </span>
                  <span className="text-ink-muted text-xs">
                    {ticket.buildingName} · {ticket.publicCode}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <PriorityBadge priority={toBadgePriority(ticket.priority)} />
                  <StatusBadge status={toBadgeStatus(ticket.status)} />
                  <RelativeDate
                    date={ticket.lastStatusChangedAt}
                    timezone={timezone}
                    className="text-ink-muted text-xs whitespace-nowrap"
                  />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
