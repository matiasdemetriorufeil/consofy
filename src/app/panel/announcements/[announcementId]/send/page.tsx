import { Megaphone } from "lucide-react";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { AnnouncementSendList } from "@/features/announcements/components/announcement-send-list";
import { MaterializeOnMount } from "@/features/announcements/components/materialize-on-mount";
import { RecipientCountSummary } from "@/features/announcements/components/recipient-count-summary";
import { prepareWhatsAppLink } from "@/features/announcements/prepare-send";
import {
  getAnnouncementForSend,
  getEditBuildingIdsForPeople,
  getMaterializedRecipients,
} from "@/features/announcements/queries";
import { formatExactDate } from "@/lib/format-date";
import { requireUser } from "@/lib/auth";

// Pantalla de envío manual (paso 8.5) -- lista de destinatarios YA
// MATERIALIZADOS con un botón "Abrir WhatsApp" por cada uno, marcado
// automático al hacer clic, barra de progreso. Regla central del
// enunciado, no reinterpretada: la lista se materializa UNA sola vez (la
// primera vez que se abre esta pantalla para un aviso dado) -- reabrir la
// pantalla lee las filas ya materializadas, nunca vuelve a correr la
// query de segmento. Eso es lo que protege un envío ya empezado contra
// cambios posteriores en los datos.
export default async function AnnouncementSendPage({
  params,
}: {
  params: Promise<{ announcementId: string }>;
}) {
  const { announcementId } = await params;
  const { organization } = await requireUser();

  const announcement = await getAnnouncementForSend(
    organization.id,
    announcementId,
  );
  if (!announcement) {
    notFound();
  }

  const recipients = await getMaterializedRecipients(
    organization.id,
    announcement.id,
  );

  // Sin filas materializadas -- dos casos DISTINTOS, no el mismo estado
  // vacío: `status` (no la cantidad de filas) es la señal autoritativa de
  // "¿ya se materializó?" -- ver el comentario de
  // materializeAnnouncementRecipientsAction (actions.ts) para por qué: un
  // segmento genuinamente vacío YA MATERIALIZADO también tiene 0 filas, y
  // confundir los dos casos dispararía la materialización de nuevo (no
  // haría daño -- es un no-op -- pero es la señal equivocada para
  // decidir qué mostrar).
  if (recipients.length === 0) {
    if (announcement.status === "draft") {
      return (
        <div className="flex flex-col gap-6">
          <h1 className="text-ink font-display text-xl font-semibold">
            Enviar -- {announcement.title}
          </h1>
          <MaterializeOnMount announcementId={announcement.id} />
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-ink font-display text-xl font-semibold">
          Enviar -- {announcement.title}
        </h1>
        <EmptyState
          icon={Megaphone}
          title="Este aviso no tiene ningún destinatario"
          description="El segmento no tenía ninguna persona que calificara en el momento de armar la lista de envío."
        />
      </div>
    );
  }

  const withPhone = recipients.filter((r) => r.phoneSnapshot).length;
  const withoutPhone = recipients.length - withPhone;

  // Link de corrección para 'skipped' (paso 8.7) -- un destinatario
  // materializado sin teléfono válido (missing o formato inválido, ver
  // getPhoneIssue) no se recalcula solo si el administrador corrige la
  // ficha después (la materialización es de una sola vez, ver el
  // comentario de materializeAnnouncementRecipientsAction): esto SOLO da
  // el link a la ficha para que la corrección quede hecha de cara a
  // FUTUROS avisos -- no revive a esta persona para ESTE envío en curso,
  // ver CLAUDE.md > Validación de teléfonos.
  const skippedPersonIds = recipients
    .filter((r) => r.deliveryStatus === "skipped")
    .map((r) => r.personId);
  const editBuildingIds =
    skippedPersonIds.length > 0
      ? await getEditBuildingIdsForPeople(organization.id, skippedPersonIds)
      : new Map<string, string>();

  // Precomputa el link de WhatsApp de cada 'pending' server-side, SIEMPRE
  // a través de getMessagingProvider() (nunca a mano) -- ver
  // prepare-send.ts. Solo lectura: no marca nada, no escribe nada.
  const recipientViews = await Promise.all(
    recipients.map(async (r) => {
      const name = [r.firstName, r.lastName].filter(Boolean).join(" ");
      let whatsappUrl: string | null = null;
      if (
        r.deliveryStatus === "pending" &&
        r.phoneSnapshot &&
        r.messageSnapshot
      ) {
        const prepared = await prepareWhatsAppLink(
          r.personId,
          name,
          r.phoneSnapshot,
          r.messageSnapshot,
        );
        whatsappUrl = prepared.ok ? prepared.url : null;
      }
      const editBuildingId =
        r.deliveryStatus === "skipped"
          ? (editBuildingIds.get(r.personId) ?? null)
          : null;
      return {
        id: r.id,
        name,
        phoneSnapshot: r.phoneSnapshot,
        messageSnapshot: r.messageSnapshot,
        deliveryStatus: r.deliveryStatus,
        errorMessage: r.errorMessage,
        sentAtLabel: r.sentAt
          ? formatExactDate(r.sentAt, organization.timezone)
          : null,
        whatsappUrl,
        editHref: editBuildingId
          ? `/panel/buildings/${editBuildingId}/people?editPerson=${r.personId}`
          : null,
      };
    }),
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-ink font-display text-xl font-semibold">
        Enviar -- {announcement.title}
      </h1>
      <RecipientCountSummary
        withPhone={withPhone}
        withoutPhone={withoutPhone}
      />
      <AnnouncementSendList initialRecipients={recipientViews} />
    </div>
  );
}
