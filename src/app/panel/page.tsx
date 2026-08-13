import { Building2 } from "lucide-react";
import { Suspense } from "react";

import { EmptyState } from "@/components/empty-state";
import { PanelGreeting } from "@/features/auth/components/panel-greeting";
import { getActiveBuildings } from "@/features/buildings/queries";
import { getSelectedBuilding } from "@/features/buildings/selected-building";
import { AttentionSection } from "@/features/tickets/components/attention-section";
import { AttentionSectionSkeleton } from "@/features/tickets/components/attention-section-skeleton";
import { BuildingSummaryCards } from "@/features/tickets/components/building-summary-cards";
import { BuildingSummaryCardsSkeleton } from "@/features/tickets/components/building-summary-cards-skeleton";
import { requireUser } from "@/lib/auth";

// Sigue siendo async y llama a requireUser() (a diferencia del resto de
// placeholders del panel, que ya no lo hacen -- ver panel-user-context.tsx):
// acá SÍ hace falta el id y el timezone de la organización para las
// queries del dashboard, no solo para mostrar el nombre. cache() (en
// src/lib/auth.ts) hace que esto no repita la consulta que ya hizo el
// layout -- resuelve casi al instante, no bloquea el streaming de abajo.
export default async function PanelHomePage() {
  const { organization } = await requireUser();

  // getActiveBuildings() ya está resuelta (cache()) desde que la llamó el
  // layout para el selector del header -- reusarla acá para decidir el
  // vacío real (paso 3.5, punto 4) no cuesta una consulta nueva.
  const [buildings, selectedBuilding] = await Promise.all([
    getActiveBuildings(organization.id),
    getSelectedBuilding(organization.id),
  ]);
  const buildingId = selectedBuilding?.id ?? null;

  return (
    <div className="flex flex-col gap-8">
      <PanelGreeting />
      {buildings.length === 0 ? (
        // Vacío real (paso 3.5, punto 4): no hay ningún edificio activo
        // cargado todavía -- invitación a crear el primero, no un cartel
        // de "no hay datos". Ver CLAUDE.md > Voz y escritura.
        <EmptyState
          icon={Building2}
          title="Todavía no tenés ningún edificio cargado"
          description="El dashboard va a mostrar acá los reclamos pendientes y urgentes de cada edificio apenas cargues el primero."
          action={{
            label: "Cargar mi primer edificio",
            href: "/panel/buildings",
          }}
        />
      ) : (
        <>
          <Suspense fallback={<AttentionSectionSkeleton />}>
            <AttentionSection
              organizationId={organization.id}
              buildingId={buildingId}
              timezone={organization.timezone}
            />
          </Suspense>
          <Suspense fallback={<BuildingSummaryCardsSkeleton />}>
            <BuildingSummaryCards
              organizationId={organization.id}
              buildingId={buildingId}
            />
          </Suspense>
        </>
      )}
    </div>
  );
}
