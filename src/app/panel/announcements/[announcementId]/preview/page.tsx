import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getAnnouncementDraftForEdit,
  getSegmentRecipientsForPreview,
  type SegmentRecipientPreview,
} from "@/features/announcements/queries";
import {
  extractPlaceholderTokens,
  MIN_RECIPIENT_PLACEHOLDERS,
  resolveRecipientPlaceholders,
} from "@/features/announcements/templates";
import { requireUser } from "@/lib/auth";

function recipientName(p: { firstName: string; lastName: string | null }) {
  return [p.firstName, p.lastName].filter(Boolean).join(" ");
}

// Vista previa de un comunicado (paso 8.4) -- pantalla de SOLO LECTURA,
// ruta propia (no una sección dentro del editor): el editor (8.3) sigue
// siendo el lugar para armar título/plantilla/segmento, y esta pantalla
// responde una pregunta distinta ("¿qué va a recibir CADA persona, tal
// cual?") que no tiene ningún control editable -- separarlas evita que el
// editor cargue lógica de renderizado por persona que no necesita mientras
// se está armando el aviso. Enlazada desde el editor (ver el botón "Ver
// vista previa" en announcement-segment-form.tsx), nunca alcanzable para
// un borrador que no existe todavía (necesita un `id` real guardado).
//
// LISTA COMPLETA, no acordeón ni selector -- criterio propio de UI: la
// cartera de edificios de este producto es chica (ver CLAUDE.md > Qué es
// este proyecto, "tres edificios de Córdoba"), así que un segmento típico
// son unas pocas decenas de personas como mucho -- render que un
// administrador puede leer de arriba a abajo sin clicks intermedios. Un
// acordeón/selector escondería justo lo que este paso pide mostrar mejor
// ("dos personas distintas del segmento muestran mensajes distintos entre
// sí") detrás de un click extra por persona. Si más adelante la cartera
// crece a un tamaño donde una lista completa deja de ser cómoda, ahí se
// justifica reconsiderar (paginar, virtualizar) -- no hay evidencia de esa
// necesidad hoy.
export default async function AnnouncementPreviewPage({
  params,
}: {
  params: Promise<{ announcementId: string }>;
}) {
  const { announcementId } = await params;
  const { organization } = await requireUser();

  const draft = await getAnnouncementDraftForEdit(
    organization.id,
    announcementId,
  );
  if (!draft) {
    notFound();
  }

  // Misma consulta que el conteo en vivo del paso 8.2
  // (countSegmentRecipients) -- ver el comentario de
  // getSegmentRecipientsForPreview (queries.ts): las dos parten de
  // findPeopleByCriteria/findPeopleByIds, así que esta lista y ese conteo
  // no pueden desincronizarse entre sí para el mismo segmento.
  const recipients = await getSegmentRecipientsForPreview(
    organization.id,
    draft.buildingId,
    draft.segment,
  );
  const withPhone = recipients.filter((r) => r.phoneE164);
  const withoutPhone = recipients.filter((r) => !r.phoneE164);

  // Placeholders que el cuerpo YA GUARDADO usa (paso 8.3) que no son
  // "nombre" ni "unidad" -- solo puede pasar en modo "sin plantilla"
  // (texto libre tipeado a mano, ver CLAUDE.md > Editor de comunicados,
  // paso 8.3). resolveRecipientPlaceholders los deja intactos a propósito
  // (ver su comentario en templates.ts) -- acá se avisa explícitamente en
  // vez de dejar que el administrador los descubra recién leyendo el
  // mensaje renderizado.
  const bodyTokens = extractPlaceholderTokens(draft.body);
  const recognized: readonly string[] = MIN_RECIPIENT_PLACEHOLDERS;
  const unrecognizedTokens = bodyTokens.filter(
    (token) => !recognized.includes(token),
  );
  const usesUnidad = bodyTokens.includes("unidad");

  function renderMessageFor(recipient: SegmentRecipientPreview): string {
    return resolveRecipientPlaceholders(draft!.body, {
      nombre: recipientName(recipient),
      unidad:
        recipient.unitLabels.length > 0
          ? recipient.unitLabels.join(", ")
          : null,
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-ink font-display text-xl font-semibold">
          Vista previa -- {draft.title}
        </h1>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/panel/announcements/${draft.id}`}>
              Volver al editor
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href={`/panel/announcements/${draft.id}/send`}>
              Enviar aviso
            </Link>
          </Button>
        </div>
      </div>

      {unrecognizedTokens.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>
            Este aviso usa un placeholder que no se resuelve
          </AlertTitle>
          <AlertDescription>
            {unrecognizedTokens.map((t) => `{{${t}}}`).join(", ")} va a aparecer
            tal cual en el mensaje -- hoy solo {"{{nombre}}"} y {"{{unidad}}"}{" "}
            se completan automáticamente con los datos de cada vecino.
          </AlertDescription>
        </Alert>
      )}

      {recipients.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title="Este segmento no tiene ningún destinatario"
          description="Revisá los criterios de destinatarios en el editor -- hoy no hay ninguna persona que califique para este aviso."
          action={{
            label: "Volver al editor",
            href: `/panel/announcements/${draft.id}`,
          }}
        />
      ) : (
        <>
          {withPhone.length === 0 && (
            <Alert variant="destructive">
              <AlertTriangle aria-hidden="true" />
              <AlertTitle>Nadie va a recibir este aviso todavía</AlertTitle>
              <AlertDescription>
                {withoutPhone.length}{" "}
                {withoutPhone.length === 1
                  ? "persona califica"
                  : "personas califican"}{" "}
                para este segmento, pero ninguna tiene teléfono cargado.
              </AlertDescription>
            </Alert>
          )}

          {withPhone.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>
                  {withPhone.length}{" "}
                  {withPhone.length === 1 ? "destinatario" : "destinatarios"}{" "}
                  van a recibir este aviso
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {withPhone.map((recipient) => (
                  <div
                    key={recipient.id}
                    className="border-border flex flex-col gap-2 rounded-md border p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-ink font-medium">
                        {recipientName(recipient)}
                      </span>
                      <span className="text-ink-muted text-xs">
                        {recipient.phoneE164}
                      </span>
                    </div>
                    <p className="text-ink-muted text-xs">
                      {recipient.unitLabels.length > 0
                        ? recipient.unitLabels.join(", ")
                        : "Sin unidad asignada"}
                    </p>
                    {usesUnidad && recipient.unitLabels.length === 0 && (
                      <p className="text-destructive text-xs">
                        Esta persona no tiene ninguna unidad vigente asignada --
                        donde la plantilla usa {"{{unidad}}"}, el mensaje va a
                        decir &quot;(sin unidad asignada)&quot;.
                      </p>
                    )}
                    <p className="text-ink bg-canvas rounded-md border border-dashed p-2 text-sm whitespace-pre-wrap">
                      {renderMessageFor(recipient)}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {withoutPhone.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>
                  {withoutPhone.length}{" "}
                  {withoutPhone.length === 1
                    ? "persona más califica"
                    : "personas más califican"}{" "}
                  por este segmento, pero no{" "}
                  {withoutPhone.length === 1 ? "tiene" : "tienen"} teléfono
                  cargado
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {withoutPhone.map((recipient) => (
                  <Badge key={recipient.id} variant="secondary">
                    {recipientName(recipient)}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
