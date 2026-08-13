import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Misma forma que BuildingSummaryCards con datos -- grilla de tarjetas, no
// un spinner. Tres tarjetas por default: coincide con los edificios del
// seed, pero el número es solo el tamaño del esqueleto, no una promesa de
// cuántos edificios va a haber.
export function BuildingSummaryCardsSkeleton() {
  return (
    <section className="flex flex-col gap-3">
      <Skeleton className="h-7 w-28" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-7 w-8" />
              </div>
              <div className="flex items-baseline justify-between">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-6" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
