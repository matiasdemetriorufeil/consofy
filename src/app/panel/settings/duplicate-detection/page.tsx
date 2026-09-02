import { CopyCheck } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { SimilarityEvaluationList } from "@/features/tickets/components/similarity-evaluation-list";
import { SimilarityEvaluationSummaryCard } from "@/features/tickets/components/similarity-evaluation-summary-card";
import { getResolvedSimilarityCandidates } from "@/features/tickets/similarity-evaluation";
import { summarizeResolvedCandidates } from "@/features/tickets/similarity-evaluation-summary";
import { requireUser } from "@/lib/auth";

// Evaluación de detección de duplicados (paso 14.5). Pantalla de SOLO
// LECTURA sobre el histórico de `ticket_similarity_candidates` ya resueltos
// (agrupados/descartados) -- sirve para calibrar con datos reales el umbral
// combinado provisorio del 14.4 (`COMBINED_SIMILARITY_THRESHOLD`), en vez
// de a ojo.
//
// Vive bajo /panel/settings (nav "Configuración") y no por edificio: el
// dato que se calibra es un umbral GLOBAL, mirarlo partido por edificio
// fragmentaría justo lo que se quiere ver entero. Protegida por el
// requireUser() del layout de /panel + el propio de acá; todo filtra por
// organization_id.
export default async function DuplicateDetectionEvaluationPage() {
  const { organization } = await requireUser();
  const rows = await getResolvedSimilarityCandidates(organization.id);
  const summary = summarizeResolvedCandidates(rows);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-ink font-display text-xl font-semibold">
          Evaluación de detección de duplicados
        </h1>
        <p className="text-ink-muted max-w-2xl text-sm">
          Sugerencias de posible duplicado que ya resolviste desde el detalle de
          un reclamo — agrupadas o descartadas — con los scores que tenían al
          momento de detectarse. Mirá si los scores más bajos casi siempre se
          descartan para ajustar el umbral.
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={CopyCheck}
          title="Todavía no resolviste ninguna sugerencia de duplicado"
          description="Cuando agrupes o descartes un posible duplicado desde el detalle de un reclamo, va a aparecer acá con sus scores, para poder calibrar la detección."
        />
      ) : (
        <>
          <SimilarityEvaluationSummaryCard summary={summary} />
          <SimilarityEvaluationList
            rows={rows}
            timezone={organization.timezone}
          />
        </>
      )}
    </div>
  );
}
