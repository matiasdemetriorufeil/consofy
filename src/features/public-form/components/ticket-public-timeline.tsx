import { RelativeDate } from "@/components/relative-date";

import type { PublicTimelineEntry } from "../public-timeline";

// Línea de tiempo simplificada del reclamo para el vecino (paso 11.2),
// dentro de `/s/[token]` (la vía del link, no adivinable -- la vía del
// código `/r/[token]/estado` NO la muestra). Server Component puro.
//
// Qué NO aparece acá, por construcción (la query ya lo filtra, ver
// public-timeline.ts): notas internas, asignación, prioridad, y cualquier
// evento que nombre a otro reclamo o a un "problema en común". Tampoco
// aparece NUNCA quién de la administración hizo cada cambio -- solo qué
// pasó y cuándo, en hora de Córdoba (zona de la organización, vía
// RelativeDate, mismo criterio que el resto de la página).
export function PublicTicketTimeline({
  entries,
  timezone,
}: {
  entries: PublicTimelineEntry[];
  timezone: string;
}) {
  return (
    <section
      aria-label="Seguimiento del reclamo"
      className="flex flex-col gap-2"
    >
      <h2 className="text-ink text-sm font-semibold">Seguimiento</h2>
      <ol className="flex flex-col gap-3">
        {entries.map((entry) => (
          <li
            key={entry.key}
            className="border-border flex flex-col gap-0.5 border-l-2 pl-3"
          >
            <span className="text-ink text-sm">{entry.text}</span>
            <RelativeDate
              date={entry.at}
              timezone={timezone}
              className="text-ink-muted text-xs"
            />
          </li>
        ))}
      </ol>
    </section>
  );
}
