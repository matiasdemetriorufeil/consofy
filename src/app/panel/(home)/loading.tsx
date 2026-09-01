import { Skeleton } from "@/components/ui/skeleton";
import { AttentionSectionSkeleton } from "@/features/tickets/components/attention-section-skeleton";
import { BuildingSummaryCardsSkeleton } from "@/features/tickets/components/building-summary-cards-skeleton";

// Skeleton del dashboard mientras `page.tsx` resuelve sus consultas en el
// servidor. Vive en el route group `(home)` (que no cambia la URL, sigue
// siendo `/panel`) para que esta forma -- saludo + atención inmediata +
// resumen por edificio -- NO se herede en `/panel/settings`, `/panel/
// buildings`, etc. Reusa los dos skeletons que ya existían como fallback
// de `<Suspense>` (paso 3.5), así el esqueleto es exactamente la forma del
// contenido real.
export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-8">
      {/* PanelGreeting: un saludo de una línea */}
      <Skeleton className="h-7 w-64" />
      <AttentionSectionSkeleton />
      <BuildingSummaryCardsSkeleton />
    </div>
  );
}
