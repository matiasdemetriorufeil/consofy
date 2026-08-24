"use client";

import { useRef, useState } from "react";

import { Progress } from "@/components/ui/progress";

import { markRecipientLinkOpenedAction } from "../actions";
import {
  AnnouncementSendRecipientRow,
  type SendRecipientView,
} from "./announcement-send-recipient-row";

// Lista interactiva de destinatarios + barra de progreso (paso 8.5).
// "Procesados" = cualquier status que NO sea 'pending' -- 'skipped' ya
// cuenta desde el arranque (pedido explícito del enunciado: nacen
// "procesados" porque nunca hubo nada que intentar para esa persona).
//
// SIN estado optimista (corregido -- ver CLAUDE.md > Pantalla de envío
// manual, diagnóstico de clicks rápidos): `deliveryStatus` de una fila
// solo cambia acá DESPUÉS de que el servidor confirmó de verdad. La
// barra de progreso y el conteo leen directo de `recipients`, así que por
// construcción nunca pueden mostrar un número mayor al confirmado real --
// no hace falta ninguna lógica aparte para eso.
export function AnnouncementSendList({
  initialRecipients,
}: {
  initialRecipients: SendRecipientView[];
}) {
  const [recipients, setRecipients] = useState(initialRecipients);
  const [confirmingIds, setConfirmingIds] = useState<Set<string>>(new Set());
  const [confirmErrors, setConfirmErrors] = useState<Record<string, string>>(
    {},
  );

  // Cola de confirmación (paso 8.5, fix del diagnóstico de clicks
  // rápidos) -- NUNCA hay más de una invocación de
  // markRecipientLinkOpenedAction en vuelo a la vez, sin importar cuántos
  // clicks lleguen mientras tanto: la causa raíz diagnosticada era que
  // varias invocaciones de Server Action disparadas casi juntas contra la
  // MISMA ruta podían perderse silenciosamente (nunca llegaban a emitir
  // el request) -- serializarlas del lado del cliente, una por vez, evita
  // el escenario que las perdía, sin necesitar ninguna reconciliación
  // periódica aparte.
  //
  // `queueRef`/`processingRef`/`enqueuedRef` son refs (no estado) a
  // propósito: tienen que leerse y escribirse de forma SÍNCRONA e
  // inmediata dentro del mismo evento de click, sin depender de que React
  // ya haya vuelto a renderizar -- un `useState` closure podría seguir
  // viendo el valor viejo si dos clicks nativos llegan en el mismo tick
  // (confirmado en la práctica: así es como un doble clic real sobre el
  // MISMO botón puede encolar el mismo id dos veces si no se lo bloquea
  // con algo que se actualice sincrónicamente).
  const queueRef = useRef<string[]>([]);
  const processingRef = useRef(false);
  const enqueuedRef = useRef<Set<string>>(new Set());

  const total = recipients.length;
  const processed = recipients.filter(
    (r) => r.deliveryStatus !== "pending",
  ).length;
  const progressValue = total > 0 ? Math.round((processed / total) * 100) : 0;

  function updateRecipient(id: string, patch: Partial<SendRecipientView>) {
    setRecipients((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  }

  async function processQueue() {
    if (processingRef.current) {
      return;
    }
    processingRef.current = true;
    while (queueRef.current.length > 0) {
      const id = queueRef.current.shift()!;
      let result: Awaited<ReturnType<typeof markRecipientLinkOpenedAction>>;
      try {
        result = await markRecipientLinkOpenedAction(id);
      } catch {
        result = {
          ok: false,
          error: "No pudimos confirmar el envío. Probá de nuevo.",
        };
      }
      enqueuedRef.current.delete(id);
      if (result.ok) {
        updateRecipient(id, {
          deliveryStatus: "link_opened",
          sentAtLabel: "recién",
        });
      } else {
        setConfirmErrors((prev) => ({ ...prev, [id]: result.error }));
      }
      setConfirmingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
    processingRef.current = false;
  }

  // Encola la confirmación de UN destinatario -- llamado apenas se
  // clickea "Abrir WhatsApp" (la pestaña/deep-link ya se abrió antes,
  // sincrónicamente, sin esperar nada de esto: ver el comentario del
  // <a href> en announcement-send-recipient-row.tsx). `enqueuedRef`
  // (no el estado `confirmingIds`) es el guard real contra encolar el
  // mismo id dos veces -- evita que un doble clic sobre el MISMO botón
  // dispare dos invocaciones para la misma persona, sin depender de que
  // React ya haya re-renderizado entre los dos clicks nativos.
  function enqueueConfirm(id: string) {
    if (enqueuedRef.current.has(id)) {
      return;
    }
    enqueuedRef.current.add(id);
    queueRef.current.push(id);
    setConfirmingIds((prev) => new Set(prev).add(id));
    setConfirmErrors((prev) => {
      if (!(id in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[id];
      return next;
    });
    void processQueue();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <div className="text-ink flex items-center justify-between text-sm">
          <span>
            {processed} de {total} destinatarios procesados
          </span>
          <span className="text-ink-muted">{progressValue}%</span>
        </div>
        <Progress value={progressValue} />
      </div>

      <div className="flex flex-col gap-3">
        {recipients.map((recipient) => (
          <AnnouncementSendRecipientRow
            key={recipient.id}
            recipient={recipient}
            isConfirming={confirmingIds.has(recipient.id)}
            confirmError={confirmErrors[recipient.id] ?? null}
            onOpenClick={() => enqueueConfirm(recipient.id)}
            onUpdate={(patch) => updateRecipient(recipient.id, patch)}
          />
        ))}
      </div>
    </div>
  );
}
