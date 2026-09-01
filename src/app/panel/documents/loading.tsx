import { Skeleton } from "@/components/ui/skeleton";

// Skeleton del explorador de documentos (paso 12.5, punto 3): título +
// botón de subir + indicador de cuota de Storage + barra de filtros +
// línea de conteo + tabla / tarjetas + paginación. ~10 filas.
const ROWS = 10;

export default function DocumentsLoading() {
  return (
    <div className="flex flex-col gap-4">
      {/* Título + botón "Subir documento" */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-9 w-40" />
      </div>

      {/* StorageQuotaIndicator: fila de texto + barra fina + nota */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-16" />
        </div>
        <Skeleton className="h-1.5 w-full rounded-full" />
        <Skeleton className="h-3 w-64" />
      </div>

      {/* DocumentFiltersBar: categoría + búsqueda */}
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-9 w-56" />
      </div>

      {/* Línea de conteo */}
      <Skeleton className="h-4 w-36" />

      {/* Tabla en desktop */}
      <div className="border-border hidden overflow-hidden rounded-lg border md:block">
        <div className="bg-muted/40 border-border flex items-center gap-4 border-b px-4 py-2.5">
          <Skeleton className="h-4 w-40 flex-1" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-24" />
        </div>
        {Array.from({ length: ROWS }).map((_, i) => (
          <div
            key={i}
            className="border-border flex items-center gap-4 border-b px-4 py-3 last:border-b-0"
          >
            <Skeleton className="h-4 w-56 flex-1" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-5 w-28 rounded-full" />
            <Skeleton className="h-4 w-24" />
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
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
          </li>
        ))}
      </ul>

      {/* Paginación */}
      <div className="flex justify-center gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-9" />
        ))}
      </div>
    </div>
  );
}
