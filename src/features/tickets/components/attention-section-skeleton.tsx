import { Skeleton } from "@/components/ui/skeleton";

// Misma forma que AttentionSection con datos (encabezado + lista de filas),
// no un spinner -- ver CLAUDE.md > paso 3.5, punto 4.
export function AttentionSectionSkeleton() {
  return (
    <section className="flex flex-col gap-3">
      <Skeleton className="h-7 w-44" />
      <div className="border-border bg-surface divide-border flex flex-col divide-y rounded-lg border">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-3 w-32" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-16" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
