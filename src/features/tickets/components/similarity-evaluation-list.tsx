import { ArrowRight } from "lucide-react";

import { RelativeDate } from "@/components/relative-date";
import { Badge } from "@/components/ui/badge";

import type { ResolvedSimilarityCandidateRow } from "../similarity-evaluation-summary";

// Lista escaneable del histórico de sugerencias resueltas (paso 14.5).
// Server Component puro -- de SOLO LECTURA (mismo criterio que la vista de
// próximos vencimientos del 9.2): la gestión real (agrupar/descartar) vive
// en el banner del detalle del reclamo (paso 7.3), esta pantalla no la
// duplica.
//
// Pensada para escanear de arriba abajo y notar la correlación score ->
// resultado: cada fila alinea el score COMBINADO (el número que se está
// calibrando, resaltado) al lado del resultado real. Orden: la decisión
// más reciente primero (lo resuelve la query, `order by updated_at desc`).

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function ScoreChip({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: number | null;
  emphasis?: boolean;
}) {
  return (
    <span
      className={
        emphasis
          ? "text-ink inline-flex items-baseline gap-1 text-sm font-medium"
          : "text-ink-muted inline-flex items-baseline gap-1 text-xs"
      }
    >
      <span>{label}</span>
      <span className="tabular-nums">{value === null ? "—" : pct(value)}</span>
    </span>
  );
}

function TicketRef({
  publicCode,
  title,
}: {
  publicCode: string;
  title: string;
}) {
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1.5">
      <span className="text-ink font-mono text-xs whitespace-nowrap">
        {publicCode}
      </span>
      <span className="text-ink-muted truncate text-xs">{title}</span>
    </span>
  );
}

export function SimilarityEvaluationList({
  rows,
  timezone,
}: {
  rows: ResolvedSimilarityCandidateRow[];
  timezone: string;
}) {
  return (
    <ul className="border-border divide-border divide-y rounded-lg border">
      {rows.map((row) => (
        <li
          key={row.candidateId}
          className="flex flex-col gap-3 p-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6"
        >
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <TicketRef
                publicCode={row.newTicket.publicCode}
                title={row.newTicket.title}
              />
              <ArrowRight
                className="text-ink-muted size-3 shrink-0"
                aria-label="posible duplicado de"
              />
              <TicketRef
                publicCode={row.oldTicket.publicCode}
                title={row.oldTicket.title}
              />
            </div>
            <p className="text-ink-muted text-xs">
              {row.buildingName} · {row.categoryName} · resuelto{" "}
              <RelativeDate date={row.resolvedAt} timezone={timezone} />
            </p>
          </div>

          <div className="flex shrink-0 flex-col gap-1.5 lg:items-end">
            <Badge
              variant={row.resolution === "grouped" ? "default" : "outline"}
            >
              {row.resolution === "grouped"
                ? "Agrupado — sí era duplicado"
                : "Descartado — no era duplicado"}
            </Badge>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 lg:justify-end">
              <ScoreChip label="trigram" value={row.trigramSimilarity} />
              <ScoreChip label="coseno" value={row.cosineSimilarity} />
              <ScoreChip label="combinado" value={row.combinedScore} emphasis />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
