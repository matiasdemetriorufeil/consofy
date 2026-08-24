"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { markRecipientFailedAction } from "../actions";
import { DELIVERY_STATUS_LABEL, type DeliveryStatus } from "../delivery-status";

export type SendRecipientView = {
  id: string;
  name: string;
  phoneSnapshot: string | null;
  messageSnapshot: string | null;
  deliveryStatus: DeliveryStatus;
  errorMessage: string | null;
  sentAtLabel: string | null;
  // Solo tiene sentido para 'pending' -- ya resuelto server-side (ver
  // prepare-send.ts) para que el <a href> abra al toque, sin depender de
  // un round-trip async que un bloqueador de pop-ups podría frenar.
  whatsappUrl: string | null;
};

const STATUS_BADGE_VARIANT: Record<
  DeliveryStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "outline",
  link_opened: "default",
  failed: "destructive",
  skipped: "secondary",
};

// Una fila por destinatario (paso 8.5) -- Client Component propio, con su
// propio estado de "marcar como fallido" independiente: mismo criterio que
// SimilarTicketBanner (paso 7.3, "UN <Alert> por candidato, no una lista
// adentro de uno solo") -- que un destinatario esté escribiendo un motivo
// de fallo no debería bloquear el click de otro.
//
// SIN estado optimista para "Abrir WhatsApp" -- corregido tras el
// diagnóstico de clicks rápidos (ver CLAUDE.md > Pantalla de envío
// manual): esta fila ya NO llama a markRecipientLinkOpenedAction ni
// actualiza `deliveryStatus` por su cuenta. `isConfirming`/`confirmError`
// vienen del lado del padre (AnnouncementSendList), que encola la
// confirmación real -- acá solo se muestra el estado que el padre decide.
export function AnnouncementSendRecipientRow({
  recipient,
  isConfirming,
  confirmError,
  onOpenClick,
  onUpdate,
}: {
  recipient: SendRecipientView;
  isConfirming: boolean;
  confirmError: string | null;
  onOpenClick: () => void;
  onUpdate: (patch: Partial<SendRecipientView>) => void;
}) {
  const [showFailForm, setShowFailForm] = useState(false);
  const [failReason, setFailReason] = useState("");
  const [failPending, setFailPending] = useState(false);
  const [failError, setFailError] = useState<string | null>(null);

  function handleConfirmFailed() {
    const reason = failReason.trim();
    if (!reason) {
      setFailError("Contá brevemente qué pasó.");
      return;
    }
    setFailPending(true);
    setFailError(null);
    markRecipientFailedAction({ recipientId: recipient.id, reason }).then(
      (result) => {
        setFailPending(false);
        if (result.ok) {
          onUpdate({ deliveryStatus: "failed", errorMessage: reason });
          setShowFailForm(false);
          toast.success("Destinatario marcado como fallido.");
        } else {
          setFailError(result.error);
        }
      },
    );
  }

  const canMarkFailed =
    !isConfirming &&
    (recipient.deliveryStatus === "pending" ||
      recipient.deliveryStatus === "link_opened");

  return (
    <div className="border-border flex flex-col gap-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-ink font-medium">{recipient.name}</span>
        <div className="flex items-center gap-2">
          {recipient.phoneSnapshot && (
            <span className="text-ink-muted text-xs">
              {recipient.phoneSnapshot}
            </span>
          )}
          {isConfirming ? (
            <Badge variant="outline">Confirmando…</Badge>
          ) : (
            <Badge variant={STATUS_BADGE_VARIANT[recipient.deliveryStatus]}>
              {DELIVERY_STATUS_LABEL[recipient.deliveryStatus]}
            </Badge>
          )}
        </div>
      </div>

      {recipient.errorMessage &&
        (recipient.deliveryStatus === "skipped" ||
          recipient.deliveryStatus === "failed") && (
          <p className="text-destructive text-xs">{recipient.errorMessage}</p>
        )}

      {recipient.sentAtLabel && (
        <p className="text-ink-muted text-xs">
          Abierto: {recipient.sentAtLabel}
        </p>
      )}

      {!isConfirming && confirmError && (
        <p className="text-destructive text-xs">
          No pudimos confirmar que se abrió WhatsApp ({confirmError}) -- probá
          de nuevo.
        </p>
      )}

      {recipient.messageSnapshot && (
        <details className="text-ink-muted text-xs">
          <summary className="cursor-pointer">Ver mensaje</summary>
          <p className="text-ink bg-canvas mt-1 rounded-md border border-dashed p-2 text-sm whitespace-pre-wrap">
            {recipient.messageSnapshot}
          </p>
        </details>
      )}

      {recipient.deliveryStatus === "pending" && isConfirming && (
        <p className="text-ink-muted text-xs">
          Confirmando que se abrió WhatsApp…
        </p>
      )}

      {recipient.deliveryStatus === "pending" &&
        !isConfirming &&
        recipient.whatsappUrl && (
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <a
                href={recipient.whatsappUrl}
                target="_blank"
                rel="noreferrer"
                onClick={onOpenClick}
              >
                {confirmError ? "Volver a abrir WhatsApp" : "Abrir WhatsApp"}
              </a>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowFailForm((v) => !v)}
            >
              Marcar como fallido
            </Button>
          </div>
        )}

      {recipient.deliveryStatus === "pending" &&
        !isConfirming &&
        !recipient.whatsappUrl && (
          <p className="text-destructive text-xs">
            No pudimos preparar el link de WhatsApp para este destinatario.
          </p>
        )}

      {recipient.deliveryStatus === "link_opened" && canMarkFailed && (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowFailForm((v) => !v)}
          >
            Marcar como fallido
          </Button>
        </div>
      )}

      {showFailForm && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={failReason}
            onChange={(e) => setFailReason(e.target.value)}
            placeholder="Ej: el número no existe"
            className="max-w-xs"
          />
          <Button
            type="button"
            size="sm"
            disabled={failPending}
            onClick={handleConfirmFailed}
          >
            {failPending ? "Guardando…" : "Confirmar"}
          </Button>
        </div>
      )}
      {failError && <p className="text-destructive text-xs">{failError}</p>}
    </div>
  );
}
