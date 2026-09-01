import { Skeleton } from "@/components/ui/skeleton";

// Skeleton de la bandeja de reclamos (paso 12.5, punto 3): misma forma que
// la pantalla real -- barra de búsqueda + fila de chips de estado + línea
// de conteo + tabla (desktop) / tarjetas (mobile) + paginación. ~12 filas,
// suficiente para llenar una pantalla sin prometer un número exacto.
const ROWS = 12;

export default function TicketsLoading() {
  return (
    <div className="flex flex-col gap-4">
      {/* TicketFiltersBar: búsqueda + botón de filtros/export */}
      <div className="flex gap-2">
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-9 w-28 shrink-0" />
      </div>

      {/* TicketStatusChips: fila de píldoras */}
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-full" />
        ))}
      </div>

      {/* Línea de conteo */}
      <Skeleton className="h-4 w-40" />

      {/* Tabla en desktop */}
      <div className="border-border hidden overflow-hidden rounded-lg border md:block">
        <div className="bg-muted/40 border-border flex items-center gap-4 border-b px-4 py-2.5">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-40 flex-1" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
        </div>
        {Array.from({ length: ROWS }).map((_, i) => (
          <div
            key={i}
            className="border-border flex items-center gap-4 border-b px-4 py-3 last:border-b-0"
          >
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-56 flex-1" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>

      {/* Tarjetas en mobile */}
      <ul className="flex flex-col gap-2 md:hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <li
            key={i}
            className="border-border bg-surface flex flex-col gap-2 rounded-lg border p-3"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </li>
        ))}
      </ul>

      {/* Paginación */}
      <div className="flex justify-center gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-9" />
        ))}
      </div>
    </div>
  );
}
