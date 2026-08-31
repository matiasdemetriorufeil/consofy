import { RelativeDate } from "@/components/relative-date";
import { Badge } from "@/components/ui/badge";
import type { TicketTimelineEventRow } from "@/features/tickets/queries";
import { describeTicketEvent } from "@/features/tickets/ticket-event-description";

// Server Component puro (paso 6.3) -- describeTicketEvent es una función
// pura y RelativeDate no necesita cliente, así que esta línea de tiempo no
// lleva ningún "use client" ni JS de más.
//
// Qué muestra y cómo: pensado para que el administrador entienda de un
// vistazo qué pasó con el reclamo (pedido explícito del enunciado) -- un
// punto por evento, ordenados cronológicamente (más viejo arriba, ver
// getTicketTimeline), con quién lo hizo, qué pasó, y cuándo
// (RelativeDate, con la fecha exacta en el tooltip nativo). El evento de
// handoff a WhatsApp usa el mismo layout que cualquier otro -- a propósito,
// para que su aclaración ("no confirma que se haya enviado ni que haya
// llegado") sea tan visible como el resto, no un detalle escondido en un
// tooltip o un ícono aparte.
const ACTOR_TYPE_LABEL: Record<TicketTimelineEventRow["actorType"], string> = {
  neighbor: "Vecino",
  admin: "Administración",
  system: "Sistema",
};

export function TicketTimeline({
  events,
  timezone,
}: {
  events: TicketTimelineEventRow[];
  timezone: string;
}) {
  if (events.length === 0) {
    return (
      <p className="text-ink-muted text-sm">
        Todavía no hay eventos registrados para este reclamo.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-4">
      {events.map((event) => {
        const description = describeTicketEvent({
          type: event.type,
          actorType: event.actorType,
          actorLabel: event.actorLabel,
          payload: event.payload,
        });
        const isResidentUpdate = event.type === "resident_update_added";
        return (
          <li key={event.id} className="flex gap-3">
            <div className="flex flex-col items-center pt-1">
              <span
                className={`size-2 shrink-0 rounded-full ${
                  isResidentUpdate ? "bg-media" : "bg-ink-muted/40"
                }`}
                aria-hidden="true"
              />
            </div>
            <div
              className={
                isResidentUpdate
                  ? "border-media/50 bg-media/5 flex flex-1 flex-col gap-0.5 rounded-md border-l-2 py-1 pr-1 pl-2"
                  : "flex flex-1 flex-col gap-0.5 pb-1"
              }
            >
              <p className="text-ink flex flex-wrap items-center gap-x-2 text-sm">
                {description.headline}
                {isResidentUpdate && (
                  <Badge variant="secondary" className="bg-media/15 text-media">
                    Agregado por el vecino
                  </Badge>
                )}
              </p>
              {description.detail && (
                <p className="text-ink-muted text-sm whitespace-pre-wrap">
                  {description.detail}
                </p>
              )}
              <p className="text-ink-muted text-xs">
                {ACTOR_TYPE_LABEL[event.actorType]} ·{" "}
                <RelativeDate date={event.createdAt} timezone={timezone} />
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
