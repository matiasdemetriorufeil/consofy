import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { getTicketSummaryByBuilding } from "../queries";

// Async Server Component, pensado para vivir dentro de un <Suspense> (ver
// panel/page.tsx) -- la otra mitad "lenta" del dashboard (paso 3.5, punto
// 6), independiente de AttentionSection: cada una hace su propia consulta
// y transmite en cuanto está lista, sin esperarse entre sí.
export async function BuildingSummaryCards({
  organizationId,
  buildingId,
}: {
  organizationId: string;
  buildingId: string | null;
}) {
  const summaries = await getTicketSummaryByBuilding(
    organizationId,
    buildingId,
  );
  const totalPending = summaries.reduce((sum, s) => sum + s.pendingCount, 0);

  return (
    <section
      aria-labelledby="buildings-heading"
      className="flex flex-col gap-3"
    >
      <h2
        id="buildings-heading"
        className="text-ink font-display text-lg font-semibold"
      >
        Edificios
      </h2>
      {totalPending === 0 && (
        // Vacío bueno del dashboard completo (paso 3.5, punto 4): hay
        // edificios, ninguno tiene reclamos pendientes. Una sola línea,
        // sin admiraciones ni festejo -- ver CLAUDE.md > Voz y escritura.
        <p className="text-ink-muted text-sm">
          Sin pendientes: todos los reclamos están al día.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {summaries.map((summary) => (
          <Card key={summary.buildingId}>
            <CardHeader>
              <CardTitle>{summary.buildingName}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {/* Cada número lleva al listado filtrado por edificio y
                  estado (paso 3.5, punto 2) -- el contrato de query params
                  (?building=&status=) todavía no lo consume ninguna
                  página real: /panel/tickets es un placeholder (paso 3.4)
                  hasta que la bandeja se construya. El link ya queda
                  armado para cuando exista. */}
              <Link
                href={`/panel/tickets?building=${summary.buildingId}&status=pending`}
                className="hover:bg-secondary focus-visible:bg-secondary focus-visible:ring-ring/50 -mx-2 flex items-baseline justify-between rounded-md px-2 py-1.5 outline-none focus-visible:ring-3"
              >
                <span className="text-ink-muted text-sm">Pendientes</span>
                <span className="text-ink font-mono text-2xl font-semibold">
                  {summary.pendingCount}
                </span>
              </Link>
              {summary.urgentPendingCount > 0 && (
                <Link
                  href={`/panel/tickets?building=${summary.buildingId}&status=pending&priority=urgent`}
                  className="text-urgente bg-urgente/10 hover:bg-urgente/20 flex items-center justify-between rounded-md px-2 py-1 text-xs font-medium"
                >
                  <span>Urgentes sin resolver</span>
                  <span className="font-mono">
                    {summary.urgentPendingCount}
                  </span>
                </Link>
              )}
              {/* Resueltos: sin protagonismo a propósito (paso 3.5, punto
                  2) -- texto más chico y apagado, mismo trato visual que
                  el resto del contenido de contexto del panel. */}
              <Link
                href={`/panel/tickets?building=${summary.buildingId}&status=resolved`}
                className="text-ink-muted hover:bg-secondary focus-visible:bg-secondary focus-visible:ring-ring/50 -mx-2 flex items-baseline justify-between rounded-md px-2 py-1.5 text-sm outline-none focus-visible:ring-3"
              >
                <span>Resueltos</span>
                <span className="font-mono">{summary.resolvedCount}</span>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
