import { Skeleton } from "@/components/ui/skeleton";

// Skeleton del historial de comunicados (paso 12.5, punto 3): título +
// botón "Crear aviso" + lista de tarjetas de aviso. Cada tarjeta:
// título + badge de estado, línea de contexto (edificio · fecha), línea de
// resumen de destinatarios. ~5 tarjetas.
const CARDS = 5;

export default function AnnouncementsLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-9 w-32" />
      </div>

      <div className="flex flex-col gap-3">
        {Array.from({ length: CARDS }).map((_, i) => (
          <div
            key={i}
            className="border-border flex flex-col gap-2 rounded-md border p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-40" />
          </div>
        ))}
      </div>
    </div>
  );
}
