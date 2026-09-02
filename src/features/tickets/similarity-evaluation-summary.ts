// Resumen numérico del histórico de sugerencias de duplicado resueltas
// (paso 14.5) -- módulo PURO, sin `import "server-only"` (misma razón que
// `hybrid-similarity.ts`): es aritmética sobre un array ya cargado,
// testeable en aislamiento.
//
// El objetivo del resumen: que un administrador pueda mirar la pantalla y
// notar si el umbral combinado provisorio del 14.4
// (`COMBINED_SIMILARITY_THRESHOLD = 0.5`) está bien puesto -- por ejemplo,
// "los combinedScore por debajo de 0.6 casi siempre se descartan". Sin
// gráficos: conteos, promedios y un desglose por franja de score.

export type SimilarityResolution = "grouped" | "discarded";

export type ResolvedSimilarityCandidateRow = {
  candidateId: string;
  resolution: SimilarityResolution;
  // Fecha de la decisión: `ticket_similarity_candidates.updated_at`, que el
  // trigger `set_updated_at` mueve al pasar `status` de "pending" a
  // "grouped"/"discarded" (paso 7.3). Nada más actualiza una fila ya
  // resuelta, así que este timestamp ES la fecha de la decisión.
  resolvedAt: Date;
  // Score persistido en `ticket_similarity_candidates.similarity`. Desde el
  // 14.4 es el COMBINADO; en filas anteriores al 14.4 es el de trigram.
  combinedScore: number;
  // Scores crudos -- SOLO en el payload del evento `similar_ticket_detected`
  // (14.4+). `null` si el candidato es anterior al 14.4 o si a alguno de
  // los dos reclamos le faltaba el embedding al detectar.
  trigramSimilarity: number | null;
  cosineSimilarity: number | null;
  newTicket: { publicCode: string; title: string };
  oldTicket: { publicCode: string; title: string };
  buildingName: string;
  categoryName: string;
};

// Umbrales de "hay suficientes datos para esto". Por debajo, la pantalla
// muestra solo los conteos y aclara que todavía es pronto para sacar
// conclusiones -- el enunciado pide no inventar análisis elaborado con
// poco volumen.
export const MIN_ROWS_FOR_AVERAGES = 2; // por grupo (agrupadas / descartadas)
export const MIN_ROWS_FOR_BUCKETS = 6; // total

export type ScoreBucket = {
  label: string;
  // Rango [lo, hi). El último bucket incluye el 1.0 (hi = 1.0000001).
  lo: number;
  hi: number;
  grouped: number;
  discarded: number;
};

export type SimilarityEvaluationSummary = {
  total: number;
  groupedCount: number;
  discardedCount: number;
  // `null` cuando ese grupo tiene menos de MIN_ROWS_FOR_AVERAGES filas.
  avgCombinedGrouped: number | null;
  avgCombinedDiscarded: number | null;
  // `null` cuando total < MIN_ROWS_FOR_BUCKETS. Ya vienen recortados: sin
  // los buckets vacíos de los extremos.
  buckets: ScoreBucket[] | null;
};

const BUCKET_EDGES = [0, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0000001];

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function summarizeResolvedCandidates(
  rows: ResolvedSimilarityCandidateRow[],
): SimilarityEvaluationSummary {
  const grouped = rows.filter((r) => r.resolution === "grouped");
  const discarded = rows.filter((r) => r.resolution === "discarded");

  const avgCombinedGrouped =
    grouped.length >= MIN_ROWS_FOR_AVERAGES
      ? mean(grouped.map((r) => r.combinedScore))
      : null;
  const avgCombinedDiscarded =
    discarded.length >= MIN_ROWS_FOR_AVERAGES
      ? mean(discarded.map((r) => r.combinedScore))
      : null;

  let buckets: ScoreBucket[] | null = null;
  if (rows.length >= MIN_ROWS_FOR_BUCKETS) {
    const all: ScoreBucket[] = [];
    for (let i = 0; i < BUCKET_EDGES.length - 1; i++) {
      const lo = BUCKET_EDGES[i]!;
      const hi = BUCKET_EDGES[i + 1]!;
      const inBucket = (r: ResolvedSimilarityCandidateRow) =>
        r.combinedScore >= lo && r.combinedScore < hi;
      all.push({
        label:
          i === BUCKET_EDGES.length - 2
            ? `${lo.toFixed(1)}–1.0`
            : `${lo.toFixed(1)}–${hi.toFixed(1)}`,
        lo,
        hi,
        grouped: grouped.filter(inBucket).length,
        discarded: discarded.filter(inBucket).length,
      });
    }
    // Recorta los buckets vacíos de los dos extremos -- si nadie tiene un
    // score < 0.6, no tiene sentido mostrar esas filas en cero.
    const firstUsed = all.findIndex((b) => b.grouped + b.discarded > 0);
    const lastUsed =
      all.length -
      1 -
      [...all].reverse().findIndex((b) => b.grouped + b.discarded > 0);
    buckets = firstUsed === -1 ? [] : all.slice(firstUsed, lastUsed + 1);
  }

  return {
    total: rows.length,
    groupedCount: grouped.length,
    discardedCount: discarded.length,
    avgCombinedGrouped,
    avgCombinedDiscarded,
    buckets,
  };
}
