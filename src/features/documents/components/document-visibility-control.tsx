"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";

import { setDocumentVisibilityAction } from "../actions";
import {
  DOCUMENT_VISIBILITY_LABEL,
  type DocumentVisibility,
} from "../document-schema";
import { MakeDocumentVisibleDialog } from "./make-document-visible-dialog";

// Control de visibilidad por fila (paso 10.3). El badge de solo lectura del
// 10.2 pasa a ser interactivo: un `<button>` con el badge adentro + un
// ícono de lápiz que señala que es editable.
//
// Por qué un control inline y no un ítem de menú `⋮` como en
// BuildingsList/PeopleList/RemindersList: acá hay UNA sola acción por fila
// (alternar la visibilidad), y un menú desplegable de un solo ítem es un
// anti-patrón. El badge ya vive en su celda mostrando el estado -- hacerlo
// clickeable es el cambio mínimo. `DocumentList` sigue siendo Server
// Component; solo este control (y su diálogo) son cliente, mismo criterio
// que SimilarTicketBanner en la vista de detalle de un reclamo.
//
// Direcciones asimétricas a propósito (riesgo R7 del plan, Ley 25.326):
//  - privado -> visible para vecinos: abre un diálogo de confirmación
//    (MakeDocumentVisibleDialog) que dice qué documento y qué va a ver un
//    vecino. Exponer hacia afuera necesita una decisión explícita.
//  - visible -> privado: cambia de inmediato, sin confirmación. Restringir
//    el acceso no tiene el mismo riesgo que abrirlo.
//
// Estado optimista: el badge refleja el cambio apenas el servidor responde
// `ok`, sin esperar a que `router.refresh()` traiga los Server Components
// nuevos (mismo criterio que SimilarTicketBanner). Se resincroniza si el
// prop del servidor cambia -- ajuste de estado DURANTE el render, no en un
// efecto (patrón ya usado en TicketFiltersBar).
export function DocumentVisibilityControl({
  documentId,
  visibility: serverVisibility,
  title,
  categoryLabel,
  buildingName,
}: {
  documentId: string;
  visibility: DocumentVisibility;
  title: string;
  categoryLabel: string;
  buildingName: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [optimistic, setOptimistic] = useState<DocumentVisibility | null>(null);
  const [prevServer, setPrevServer] = useState(serverVisibility);
  if (serverVisibility !== prevServer) {
    setPrevServer(serverVisibility);
    setOptimistic(null);
  }
  const visibility = optimistic ?? serverVisibility;

  function apply(target: DocumentVisibility) {
    startTransition(async () => {
      const result = await setDocumentVisibilityAction({
        documentId,
        visibility: target,
      });
      if (result.ok) {
        setOptimistic(result.visibility);
        setConfirmOpen(false);
        toast.success(
          result.visibility === "residents"
            ? `"${title}" ahora es visible para los vecinos.`
            : `"${title}" ahora es privado.`,
        );
        // Reconcilia con el servidor sin recargar la página entera -- vuelve
        // a traer los Server Components de esta ruta (ver CLAUDE.md >
        // Acciones sobre un reclamo, paso 6.4, sobre por qué revalidatePath
        // solo no alcanza para una pantalla ya montada).
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleClick() {
    if (visibility === "private") {
      setConfirmOpen(true);
    } else {
      apply("private");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        aria-label={
          visibility === "private"
            ? "Visibilidad: privado. Cambiar a visible para vecinos"
            : "Visibilidad: visible para vecinos. Cambiar a privado"
        }
        // min-h-6 (24px) sin tocar el alto del <Badge> de adentro (h-5):
        // agranda el destino táctil al mínimo de WCAG 2.5.8 (paso 12.6)
        // sin cambiar el diseño visible de la fila -- items-center deja el
        // badge centrado en esos 24px.
        className="group focus-visible:ring-ring/50 inline-flex min-h-6 items-center gap-1 rounded-full outline-none focus-visible:ring-2 disabled:opacity-60"
      >
        <Badge
          variant={visibility === "residents" ? "outline" : "secondary"}
          className="group-hover:brightness-95"
        >
          {DOCUMENT_VISIBILITY_LABEL[visibility]}
        </Badge>
        <Pencil className="text-ink-muted size-3" aria-hidden="true" />
      </button>

      <MakeDocumentVisibleDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={title}
        categoryLabel={categoryLabel}
        buildingName={buildingName}
        isPending={isPending}
        onConfirm={() => apply("residents")}
      />
    </>
  );
}
