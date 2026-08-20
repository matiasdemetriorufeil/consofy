import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Phone } from "lucide-react";
import Link from "next/link";
import { z } from "zod";

import { RelativeDate } from "@/components/relative-date";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AttachmentGallery } from "@/features/tickets/components/attachment-gallery";
import { PriorityBadge } from "@/features/tickets/components/priority-badge";
import { StatusBadge } from "@/features/tickets/components/status-badge";
import { TicketActionsPanel } from "@/features/tickets/components/ticket-actions-panel";
import { TicketCode } from "@/features/tickets/components/ticket-code";
import { TicketTimeline } from "@/features/tickets/components/ticket-timeline";
import {
  getAssigneeFilterOptions,
  getTicketAttachments,
  getTicketDetail,
  getTicketTimeline,
} from "@/features/tickets/queries";
import { createSignedAttachmentUrls } from "@/features/tickets/storage-objects";
import {
  toBadgePriority,
  toBadgeStatus,
  toSourceLabel,
} from "@/features/tickets/status-mapping";
import { personHasAnyOccupancy } from "@/features/people/queries";
import { requireUser } from "@/lib/auth";

// Vista de detalle de un reclamo (paso 6.3) -- solo lectura, las acciones
// (cambiar estado, asignar, notas) son el paso 6.4. Cierra dos pendientes
// reales (ver CLAUDE.md > Pendientes): el administrador no tenía HOY
// ninguna forma de ver los adjuntos de un reclamo desde el panel (dependía
// de encontrar el WhatsApp viejo), y un vecino sin ocupación en ninguna
// unidad era invisible en cualquier pantalla del panel.
//
// Cross-org y uuid inválido -- notFound() para los dos, mismo criterio de
// ambigüedad ya fijado en /panel/buildings/[buildingId] (ver ese layout):
// no hay forma de que quien mira la pantalla distinga "no existe" de "no
// es tuyo", y esa ambigüedad es la defensa correcta. getTicketDetail()
// filtra por organizationId en el WHERE mismo (nunca después, en JS), así
// que un id real de OTRA organización devuelve null acá exactamente igual
// que un uuid inventado -- no hay ninguna rama de código que distinga los
// dos casos ni que pueda filtrar por error cuáles ids son válidos en otra
// organización.
function DetailField({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-ink-muted text-xs">{label}</dt>
      <dd className="text-ink text-sm">{value}</dd>
    </div>
  );
}

export default async function TicketDetailPage({
  params,
  searchParams,
}: PageProps<"/panel/tickets/[ticketId]">) {
  const { organization } = await requireUser();
  const { ticketId } = await params;

  const parsedId = z.uuid().safeParse(ticketId);
  if (!parsedId.success) {
    notFound();
  }

  const ticket = await getTicketDetail(organization.id, parsedId.data);
  if (!ticket) {
    notFound();
  }

  const [attachments, timeline, neighborHasOccupancy, assigneeOptions] =
    await Promise.all([
      getTicketAttachments(organization.id, ticket.id),
      getTicketTimeline(organization.id, ticket.id),
      ticket.neighborId
        ? personHasAnyOccupancy(organization.id, ticket.neighborId)
        : Promise.resolve(true),
      getAssigneeFilterOptions(organization.id),
    ]);

  // URLs firmadas de corta duración, generadas EN CADA CARGA -- mismo
  // criterio que /s/[token] (ver CLAUDE.md > Galería pública de adjuntos):
  // hay sesión verificada acá (a diferencia de esa ruta pública), pero eso
  // no cambia el criterio -- la URL firmada sigue siendo lo único que
  // puede servir bytes de un bucket privado sin SELECT para
  // `anon`/`authenticated`, y una URL que vence sigue siendo mejor que una
  // permanente aunque quien la vea tenga sesión: si esta página quedara
  // abierta en una pestaña o el link se compartiera sin querer, una URL
  // vencida no sirve nada pasada la hora.
  const signedUrls =
    attachments.length > 0
      ? await createSignedAttachmentUrls(
          attachments.map((attachment) => attachment.storagePath),
        )
      : new Map<string, string>();

  const rawSearchParams = await searchParams;
  const fromRaw = rawSearchParams?.from;
  const from = typeof fromRaw === "string" ? fromRaw : undefined;
  const backHref = from ? `/panel/tickets?${from}` : "/panel/tickets";

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={backHref}
        className="text-ink-muted hover:text-ink inline-flex w-fit items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Volver a la bandeja
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-ink font-display text-xl font-semibold">
              {ticket.title}
            </h1>
            <TicketCode code={ticket.publicCode} />
          </div>
          <p className="text-ink-muted text-sm">
            {ticket.buildingName}
            {ticket.unitLabel ? ` · ${ticket.unitLabel}` : ""} ·{" "}
            {ticket.categoryName}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PriorityBadge priority={toBadgePriority(ticket.priority)} />
          <StatusBadge status={toBadgeStatus(ticket.status)} />
        </div>
      </div>

      <TicketActionsPanel
        ticketId={ticket.id}
        currentStatus={ticket.status}
        currentPriority={ticket.priority}
        currentAssignee={ticket.assignee}
        assigneeOptions={assigneeOptions}
      />

      <Card>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <DetailField
              label="Reportado"
              value={
                <RelativeDate
                  date={ticket.reportedAt}
                  timezone={organization.timezone}
                />
              }
            />
            <DetailField label="Origen" value={toSourceLabel(ticket.source)} />
            {ticket.resolvedAt && (
              <DetailField
                label="Resuelto"
                value={
                  <RelativeDate
                    date={ticket.resolvedAt}
                    timezone={organization.timezone}
                  />
                }
              />
            )}
            {ticket.closedAt && (
              <DetailField
                label="Cerrado"
                value={
                  <RelativeDate
                    date={ticket.closedAt}
                    timezone={organization.timezone}
                  />
                }
              />
            )}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Descripción</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-ink text-sm whitespace-pre-wrap">
            {ticket.description}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vecino</CardTitle>
        </CardHeader>
        <CardContent>
          {ticket.neighborId ? (
            <div className="flex flex-col gap-1.5 text-sm">
              <p className="text-ink font-medium">
                {ticket.neighborName || "Sin nombre"}
              </p>
              {ticket.neighborPhoneE164 ? (
                <a
                  href={`tel:${ticket.neighborPhoneE164}`}
                  className="text-ink-muted hover:text-ink inline-flex w-fit items-center gap-1.5 hover:underline"
                >
                  <Phone className="size-3.5" aria-hidden="true" />
                  {ticket.neighborPhoneE164}
                </a>
              ) : (
                <p className="text-ink-muted">Sin teléfono cargado</p>
              )}
              {ticket.neighborEmail && (
                <p className="text-ink-muted inline-flex w-fit items-center gap-1.5">
                  <Mail className="size-3.5" aria-hidden="true" />
                  {ticket.neighborEmail}
                </p>
              )}
              {/* Resuelve el Pendiente "un vecino sin ocupación es
                  invisible en el panel" -- este aviso es justamente lo que
                  faltaba: hoy este vecino no aparece en la pestaña
                  "Personas" de ningún edificio (esa lista exige una
                  ocupación), pero acá se lo puede ver igual. */}
              {!neighborHasOccupancy && (
                <p className="text-ink-muted border-border rounded-md border border-dashed px-2.5 py-1.5 text-xs">
                  Este vecino no tiene ninguna unidad asignada en el sistema --
                  no va a aparecer en la lista de Personas de ningún edificio
                  hasta que se le cargue una.
                </p>
              )}
            </div>
          ) : (
            <p className="text-ink-muted text-sm">
              Este reclamo no tiene un vecino asociado.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Adjuntos</CardTitle>
        </CardHeader>
        <CardContent>
          <AttachmentGallery
            attachments={attachments}
            signedUrls={signedUrls}
            emptyMessage="Este reclamo no tiene fotos ni archivos adjuntos."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Línea de tiempo</CardTitle>
        </CardHeader>
        <CardContent>
          <TicketTimeline events={timeline} timezone={organization.timezone} />
        </CardContent>
      </Card>
    </div>
  );
}
