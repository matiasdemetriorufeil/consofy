import { Megaphone } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { RelativeDate } from "@/components/relative-date";
import { Button } from "@/components/ui/button";
import { AnnouncementStatusBadge } from "@/features/announcements/components/announcement-status-badge";
import {
  countSegmentRecipients,
  getAnnouncementRecipientSummaries,
  getAnnouncementsList,
  type AnnouncementListRow,
} from "@/features/announcements/queries";
import { requireUser } from "@/lib/auth";

// Adónde lleva cada fila -- criterio fijado en el paso 8.6, documentado acá
// porque es la única decisión de ruteo de toda la pantalla: 'draft' es el
// ÚNICO estado que getAnnouncementDraftForEdit (paso 8.3) acepta -- ir al
// editor con cualquier otro estado devolvería 404, así que "draft -> editor" no
// es una preferencia de UX, es lo único que funciona. Cualquier otro
// estado ('sending', 'sent', y los dos no alcanzables hoy por ningún flujo
// construido, 'scheduled'/'failed' -- ver CLAUDE.md > Pantalla de envío
// manual) va a la pantalla de envío (paso 8.5): esa pantalla ya es de solo
// lectura por sí sola en cuanto no queda ningún destinatario 'pending' (los
// botones de acción solo se renderizan para 'pending'), así que sirve tal
// cual como vista de detalle para 'sent' sin necesitar ninguna variante
// nueva -- reusar en vez de construir una pantalla aparte, como sugería el
// enunciado.
function hrefForAnnouncement(row: AnnouncementListRow): string {
  return row.status === "draft"
    ? `/panel/announcements/${row.id}`
    : `/panel/announcements/${row.id}/send`;
}

// Paso 8.6 -- reemplaza el EmptyState que hasta acá era la pantalla
// COMPLETA (ver el comentario que este archivo tenía desde el 8.2): ahora
// es solo el caso de cero avisos, la lista real vive abajo.
export default async function AnnouncementsPage() {
  const { organization } = await requireUser();

  const rows = await getAnnouncementsList(organization.id);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Megaphone}
        title="Todavía no hay avisos"
        description="Acá vas a poder escribir un aviso y mandarlo a los vecinos de uno o varios edificios."
        action={{ label: "Crear aviso", href: "/panel/announcements/new" }}
      />
    );
  }

  // Resumen de destinatarios -- una sola consulta agrupada para todos los
  // avisos YA MATERIALIZADOS (cualquier estado que no sea 'draft', ver
  // getAnnouncementRecipientSummaries) más, para los borradores SIN
  // materializar, el conteo en vivo del segmento (paso 8.2, ya existente,
  // barato: es la misma consulta que ya corre en cada cambio del editor) --
  // ver el comentario de esa función para por qué "barato" no es una
  // suposición acá: con el volumen real de avisos de esta organización
  // (confirmado en el reporte de este paso), correr un conteo por
  // borrador no pesa nada.
  const materializedIds = rows
    .filter((r) => r.status !== "draft")
    .map((r) => r.id);
  const draftRows = rows.filter((r) => r.status === "draft");

  const [summaries, draftCounts] = await Promise.all([
    getAnnouncementRecipientSummaries(organization.id, materializedIds),
    Promise.all(
      draftRows.map((r) =>
        countSegmentRecipients(organization.id, r.buildingId, r.segment),
      ),
    ),
  ]);
  const draftCountById = new Map(
    draftRows.map((r, i) => [r.id, draftCounts[i]]),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-ink font-display text-xl font-semibold">Avisos</h1>
        <Button asChild>
          <Link href="/panel/announcements/new">Crear aviso</Link>
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        {rows.map((row) => {
          const summary = summaries.get(row.id);
          const draftCount = draftCountById.get(row.id);

          return (
            <Link
              key={row.id}
              href={hrefForAnnouncement(row)}
              className="border-border hover:bg-secondary focus-visible:bg-secondary focus-visible:ring-ring/50 flex flex-col gap-2 rounded-md border p-4 transition-colors outline-none focus-visible:ring-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-ink font-medium">{row.title}</span>
                <AnnouncementStatusBadge status={row.status} />
              </div>

              {/* createdAt es la fecha PRINCIPAL, siempre presente y la
                  misma que ordena la lista -- sentAt no alcanza sola
                  porque no todo estado la tiene (draft/sending nunca).
                  CORREGIDO tras el paso 8.6: maybeMarkAnnouncementSent
                  (actions.ts) ahora sí completa sentAt en la misma
                  escritura que pasa status a 'sent', así que esta línea
                  extra deja de depender solo del aviso de seed -- ver
                  CLAUDE.md > Historial de comunicados. */}
              <div className="text-ink-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span>{row.buildingName ?? "Todos los edificios"}</span>
                <span aria-hidden="true">·</span>
                <RelativeDate
                  date={row.createdAt}
                  timezone={organization.timezone}
                />
                {row.status === "sent" && row.sentAt && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>
                      Enviado{" "}
                      <RelativeDate
                        date={row.sentAt}
                        timezone={organization.timezone}
                      />
                    </span>
                  </>
                )}
              </div>

              {summary && (
                <p className="text-ink-muted text-sm">
                  {summary.linkOpened} de {summary.total} enviados
                  {summary.withoutPhone > 0 &&
                    ` · ${summary.withoutPhone} sin teléfono`}
                </p>
              )}

              {!summary && draftCount && (
                <p className="text-ink-muted text-sm">
                  {draftCount.qualifiedWithPhone}{" "}
                  {draftCount.qualifiedWithPhone === 1
                    ? "destinatario"
                    : "destinatarios"}
                  {draftCount.qualifiedWithoutPhone > 0 &&
                    ` · ${draftCount.qualifiedWithoutPhone} sin teléfono`}
                </p>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
