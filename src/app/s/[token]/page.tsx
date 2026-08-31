import { notFound } from "next/navigation";
import { z } from "zod";

import { RelativeDate } from "@/components/relative-date";
import { Card, CardContent } from "@/components/ui/card";
import { ResidentUpdateForm } from "@/features/public-form/components/resident-update-form";
import { PublicTicketTimeline } from "@/features/public-form/components/ticket-public-timeline";
import { PublicTicketStatusBadge } from "@/features/public-form/components/ticket-status-summary";
import { buildPublicTimeline } from "@/features/public-form/public-timeline";
import { getTicketByAttachmentsToken } from "@/features/public-form/queries";
import { PUBLIC_TICKET_STATUS_LABEL } from "@/features/public-form/status-lookup-schema";
import { MAX_TICKET_PHOTOS } from "@/features/public-form/ticket-schema";
import { AttachmentGallery } from "@/features/tickets/components/attachment-gallery";
import { createSignedAttachmentUrls } from "@/features/tickets/storage-objects";

// Estados en los que el vecino todavía puede agregar información/fotos
// (paso 11.4) -- los dos "abiertos" del enum `ticket_status`. Verificado
// contra src/db/schema/tickets.ts.
const OPEN_STATUSES = new Set(["new", "in_progress"]);

// Ruta pública, sin sesión (paso 5.10) -- mismo criterio que /r/[token]
// (ver CLAUDE.md > Qué es este proyecto): quien llega acá no tiene por qué
// tener una cuenta, ni el administrador (la toca desde WhatsApp, apurado,
// puede no tener sesión viva en ese navegador) ni el propio vecino
// (vuelve a ver sus fotos desde la pantalla de confirmación). La
// seguridad de esta ruta NO es "requiere login" -- es que `token` (a
// diferencia de public_code) es imposible de adivinar. Ver el análisis de
// seguridad completo del reporte de este paso.
//
// Dos resultados posibles:
// 1. Token mal formado, inexistente, o edificio dado de baja -> notFound()
//    -- ver not-found.tsx. Ambigüedad deliberada, mismo criterio que
//    /r/[token].
// 2. Token válido -> la galería. CON o SIN fotos: un reclamo sin adjuntos
//    muestra un mensaje honesto ("este reclamo no tiene fotos"), nunca un
//    404 -- el token ya autorizó a esta persona a saber eso, no hay nada
//    que ocultarle sobre SU PROPIO reclamo (ver el reporte, "reclamo sin
//    fotos").
export default async function TicketAttachmentsGalleryPage({
  params,
}: PageProps<"/s/[token]">) {
  const { token } = await params;

  const parsedToken = z.uuid().safeParse(token);
  if (!parsedToken.success) {
    notFound();
  }

  const ticket = await getTicketByAttachmentsToken(parsedToken.data);
  if (!ticket) {
    notFound();
  }

  // URLs firmadas de corta duración, generadas EN CADA CARGA de la
  // página -- nunca un link permanente (ver CLAUDE.md > Reglas de
  // seguridad, no negociable). Un archivo sin URL (falló la firma, o fue
  // borrado del bucket por fuera de la app) se omite en silencio -- ver
  // storage-objects.ts -- en vez de tirar abajo el resto de la galería.
  const signedUrls =
    ticket.attachments.length > 0
      ? await createSignedAttachmentUrls(
          ticket.attachments.map((attachment) => attachment.storagePath),
        )
      : new Map<string, string>();

  // Qué entra en la página además de las fotos (paso 5.10 + estado desde el
  // 11.1 -- el token puede circular reenviado, así que sólo datos que ya
  // viajan en el mensaje de WhatsApp que trajo este link, o que son del
  // propio reclamo de quien mira): edificio, unidad, categoría, nombre del
  // vecino, descripción, fecha y -- nuevo en 11.1 -- título y ESTADO. El
  // link ya se llamaba "Ver el estado de tu reclamo" desde el paso 5.8;
  // este paso lo hace honesto (ver CLAUDE.md > Pendientes, la nota del paso
  // 6.4 sobre "avisarle algo al vecino": mejora de pull sobre esta misma
  // página, sin ningún canal de push nuevo).
  // Deliberadamente AFUERA todavía: el teléfono del vecino, quién tiene el
  // reclamo asignado, las notas internas y cualquier acción de edición --
  // esto sigue siendo una vista pública de SOLO LECTURA. La línea de tiempo
  // simplificada (paso 11.2) SÍ entra ahora, pero filtrada: solo cambios de
  // estado del propio reclamo, nunca notas/asignación/prioridad ni el
  // nombre de quien de la administración hizo cada cambio (ver
  // public-timeline.ts).
  const unitAndBuilding = ticket.unitLabel
    ? `${ticket.buildingName} · ${ticket.unitLabel}`
    : ticket.buildingName;

  const timeline = buildPublicTimeline(
    ticket.reportedAt,
    ticket.timelineEvents,
  );

  return (
    <div className="flex w-full max-w-lg flex-col gap-4">
      <Card className="w-full">
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-start justify-between gap-2">
              <h1 className="text-ink font-display text-lg font-semibold">
                {unitAndBuilding}
              </h1>
              <PublicTicketStatusBadge status={ticket.status} />
            </div>
            <p className="text-ink text-sm font-medium">{ticket.title}</p>
            <p className="text-ink-muted text-sm">
              {ticket.neighborName || "Vecino"} · {ticket.categoryName}
            </p>
            <p className="text-ink-muted text-xs">
              Reclamo <span className="font-mono">{ticket.publicCode}</span> ·{" "}
              <RelativeDate
                date={ticket.reportedAt}
                timezone={ticket.organizationTimezone}
              />
            </p>
          </div>

          <p className="text-ink text-sm whitespace-pre-wrap">
            {ticket.description}
          </p>

          <PublicTicketTimeline
            entries={timeline}
            timezone={ticket.organizationTimezone}
          />

          <AttachmentGallery
            attachments={ticket.attachments}
            signedUrls={signedUrls}
            emptyMessage="Este reclamo no tiene fotos ni archivos adjuntos."
          />

          {OPEN_STATUSES.has(ticket.status) ? (
            <ResidentUpdateForm
              token={parsedToken.data}
              remainingSlots={Math.max(
                0,
                MAX_TICKET_PHOTOS - ticket.attachments.length,
              )}
            />
          ) : (
            <p className="text-ink-muted border-border rounded-lg border border-dashed p-3 text-sm">
              Este reclamo está{" "}
              <span className="font-medium">
                {PUBLIC_TICKET_STATUS_LABEL[ticket.status].toLowerCase()}
              </span>
              , así que ya no se le puede agregar información. Si necesitás algo
              más, comunicate directo con tu administración.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
