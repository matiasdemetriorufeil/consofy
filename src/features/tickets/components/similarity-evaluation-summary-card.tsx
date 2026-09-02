import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { COMBINED_SIMILARITY_THRESHOLD } from "../hybrid-similarity";
import type { SimilarityEvaluationSummary } from "../similarity-evaluation-summary";

// Resumen numérico arriba de la lista (paso 14.5). Server Component puro
// -- no hay estado ni interacción, solo lee `summary` (ya calculado en el
// server por `summarizeResolvedCandidates`).

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function SimilarityEvaluationSummaryCard({
  summary,
}: {
  summary: SimilarityEvaluationSummary;
}) {
  const {
    total,
    groupedCount,
    discardedCount,
    avgCombinedGrouped,
    avgCombinedDiscarded,
    buckets,
  } = summary;

  const lowVolume =
    avgCombinedGrouped === null && avgCombinedDiscarded === null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resumen</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div>
            <span className="text-ink-muted">Decisiones</span>{" "}
            <span className="text-ink font-medium tabular-nums">{total}</span>
          </div>
          <div>
            <span className="text-ink-muted">Agrupadas (sí era duplicado)</span>{" "}
            <span className="text-ink font-medium tabular-nums">
              {groupedCount}
            </span>
          </div>
          <div>
            <span className="text-ink-muted">
              Descartadas (no era duplicado)
            </span>{" "}
            <span className="text-ink font-medium tabular-nums">
              {discardedCount}
            </span>
          </div>
        </div>

        {(avgCombinedGrouped !== null || avgCombinedDiscarded !== null) && (
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            {avgCombinedGrouped !== null && (
              <div>
                <span className="text-ink-muted">
                  Score combinado promedio · agrupadas
                </span>{" "}
                <span className="text-ink font-medium tabular-nums">
                  {pct(avgCombinedGrouped)}
                </span>
              </div>
            )}
            {avgCombinedDiscarded !== null && (
              <div>
                <span className="text-ink-muted">
                  Score combinado promedio · descartadas
                </span>{" "}
                <span className="text-ink font-medium tabular-nums">
                  {pct(avgCombinedDiscarded)}
                </span>
              </div>
            )}
          </div>
        )}

        {buckets && buckets.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-ink-muted text-xs">
              Cómo se resolvió cada sugerencia según su score combinado
            </p>
            <div className="overflow-x-auto">
              <table className="text-sm">
                <thead>
                  <tr className="text-ink-muted text-left">
                    <th className="pr-6 pb-1 font-medium">Score combinado</th>
                    <th className="pr-6 pb-1 text-right font-medium">
                      Agrupadas
                    </th>
                    <th className="pb-1 text-right font-medium">Descartadas</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {buckets.map((b) => (
                    <tr key={b.label}>
                      <td className="text-ink py-0.5 pr-6">{b.label}</td>
                      <td className="text-ink py-0.5 pr-6 text-right">
                        {b.grouped}
                      </td>
                      <td className="text-ink py-0.5 text-right">
                        {b.discarded}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {lowVolume && (
          <p className="text-ink-muted text-xs">
            Todavía hay pocas decisiones para sacar conclusiones firmes. La
            lista de abajo es el dato crudo; el umbral combinado vigente es{" "}
            <span className="tabular-nums">
              {pct(COMBINED_SIMILARITY_THRESHOLD)}
            </span>
            .
          </p>
        )}
      </CardContent>
    </Card>
  );
}
