import { notFound } from "next/navigation";
import { File as FileIcon } from "lucide-react";
import { z } from "zod";

import { RelativeDate } from "@/components/relative-date";
import { Card, CardContent } from "@/components/ui/card";
import { getTicketByAttachmentsToken } from "@/features/public-form/queries";
import { createSignedAttachmentUrls } from "@/features/public-form/storage-objects";

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

  // Qué entra en la página además de las fotos (paso 5.10, decisión
  // explícita -- el token puede circular reenviado, así que no se agrega
  // nada que no esté YA en el mensaje de WhatsApp que trajo este link):
  // edificio, unidad, categoría, nombre del vecino, descripción y fecha
  // -- los mismos datos que ya viajan en texto plano en ese mensaje (ver
  // CLAUDE.md > Formato del mensaje al administrador), así que mostrarlos
  // acá no es exposición nueva, es orientar a quien mira "qué es esto".
  // Deliberadamente AFUERA: el teléfono del vecino (no viaja en el
  // mensaje tampoco, no hay motivo para agregarlo acá), el estado del
  // reclamo, quién lo tiene asignado, o cualquier acción de edición --
  // esto es una vista de SOLO LECTURA de las fotos de un reclamo puntual,
  // "y nada más" (pedido explícito del enunciado), no una versión
  // pública del detalle del panel.
  const unitAndBuilding = ticket.unitLabel
    ? `${ticket.buildingName} · ${ticket.unitLabel}`
    : ticket.buildingName;

  return (
    <div className="flex w-full max-w-lg flex-col gap-4">
      <Card className="w-full">
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-ink font-display text-lg font-semibold">
              {unitAndBuilding}
            </h1>
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

          {ticket.attachments.length === 0 ? (
            <p className="text-ink-muted rounded-lg border border-dashed p-4 text-center text-sm">
              Este reclamo no tiene fotos ni archivos adjuntos.
            </p>
          ) : (
            <ul className="flex flex-col gap-3 sm:grid sm:grid-cols-2">
              {ticket.attachments.map((attachment) => {
                const url = signedUrls.get(attachment.storagePath);
                if (!url) {
                  return null;
                }
                const isImage = attachment.mimeType.startsWith("image/");
                return (
                  <li key={attachment.id}>
                    {/* target="_blank" a un archivo YA cargado (no un
                        <Image> de Next): la URL es firmada y de corta
                        duración, cambia en cada carga de esta página --
                        el optimizador de imágenes de Next intentaría
                        cachear/proxear una URL pensada para vencer, así
                        que una imagen simple es lo correcto acá, no un
                        atajo. Abrir en una pestaña nueva le da al
                        administrador el visor nativo del celular, con
                        zoom real, sin construir un lightbox propio. */}
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      {isImage ? (
                        // eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal, no un asset de Next
                        <img
                          src={url}
                          alt={attachment.originalFilename}
                          loading="lazy"
                          className="border-border h-64 w-full rounded-lg border object-cover"
                        />
                      ) : (
                        <div className="border-border bg-muted/40 flex h-64 w-full flex-col items-center justify-center gap-2 rounded-lg border">
                          <FileIcon className="text-muted-foreground size-8" />
                          <span className="text-ink-muted px-4 text-center text-sm">
                            {attachment.originalFilename}
                          </span>
                        </div>
                      )}
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
