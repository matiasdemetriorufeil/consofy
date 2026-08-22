import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PriorityBadge } from "@/features/tickets/components/priority-badge";
import { StatusBadge } from "@/features/tickets/components/status-badge";
import { TicketCode } from "@/features/tickets/components/ticket-code";
import {
  toBadgePriority,
  toBadgeStatus,
} from "@/features/tickets/status-mapping";
import { deriveAffectedParties } from "@/features/incidents/derive-affected-parties";
import {
  getIncidentDetail,
  getIncidentTickets,
} from "@/features/incidents/queries";
import { requireUser } from "@/lib/auth";

// Vista de detalle de un incidente / "problema en común" (paso 7.4) --
// muestra qué categoría+edificio agrupa, los tickets agrupados con su
// estado individual, y las unidades/vecinos afectados (deduplicados, ver
// derive-affected-parties.ts). Solo lectura -- ninguna acción de este paso
// (propagar resolución es 7.5, todavía no existe).
//
// Cross-org, uuid inválido, o incidente soft-borrado (fusionado hacia
// otro, ver group-tickets-into-incident.ts) -- notFound() para los tres,
// mismo criterio de ambigüedad ya fijado en /panel/tickets/[ticketId]:
// getIncidentDetail() filtra los tres casos en el WHERE mismo.
export default async function IncidentDetailPage({
  params,
}: PageProps<"/panel/incidents/[incidentId]">) {
  const { organization } = await requireUser();
  const { incidentId } = await params;

  const parsedId = z.uuid().safeParse(incidentId);
  if (!parsedId.success) {
    notFound();
  }

  const incident = await getIncidentDetail(organization.id, parsedId.data);
  if (!incident) {
    notFound();
  }

  const incidentTickets = await getIncidentTickets(
    organization.id,
    incident.id,
  );
  const { units, neighbors } = deriveAffectedParties(incidentTickets);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/panel/tickets"
        className="text-ink-muted hover:text-ink inline-flex w-fit items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Volver a la bandeja
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-ink font-display text-xl font-semibold">
            {incident.title}
          </h1>
          <p className="text-ink-muted text-sm">
            {incident.buildingName} · {incident.categoryName}
          </p>
        </div>
        <Badge
          variant="outline"
          className={
            incident.status === "resolved"
              ? "bg-resuelto/10 text-resuelto font-body border-transparent"
              : "bg-media/10 text-media font-body border-transparent"
          }
        >
          {incident.status === "resolved" ? "Resuelto" : "Abierto"}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Reclamos agrupados ({incidentTickets.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {incidentTickets.length === 0 ? (
            <p className="text-ink-muted text-sm">
              Este problema en común no tiene reclamos activos.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {incidentTickets.map((ticket) => (
                <li key={ticket.id}>
                  <Link
                    href={`/panel/tickets/${ticket.id}`}
                    className="border-border hover:bg-canvas flex flex-col gap-2 rounded-md border p-3 transition-colors sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <TicketCode code={ticket.publicCode} />
                        <span className="text-ink text-sm font-medium">
                          {ticket.title}
                        </span>
                      </div>
                      {(ticket.unitLabel || ticket.neighborName) && (
                        <p className="text-ink-muted text-xs">
                          {[ticket.unitLabel, ticket.neighborName]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <PriorityBadge
                        priority={toBadgePriority(ticket.priority)}
                      />
                      <StatusBadge status={toBadgeStatus(ticket.status)} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Unidades afectadas ({units.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {units.length === 0 ? (
            <p className="text-ink-muted text-sm">
              Ningún reclamo de este problema tiene una unidad asociada.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {units.map((unit) => (
                <li key={unit.label}>
                  <Badge variant="outline" className="font-body">
                    {unit.label}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vecinos afectados ({neighbors.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {neighbors.length === 0 ? (
            <p className="text-ink-muted text-sm">
              Ningún reclamo de este problema tiene un vecino asociado.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {neighbors.map((neighbor) => (
                <li key={neighbor.id} className="text-ink text-sm">
                  {neighbor.name}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
