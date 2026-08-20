"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  bulkAssignTicketsAction,
  bulkChangeTicketStatusAction,
} from "../actions";
import { STATUS_LABEL } from "./status-badge";
import { toBadgeStatus } from "../status-mapping";
import type {
  BulkActionResult,
  BulkTicketSelection,
} from "../ticket-bulk-schema";

const STATUS_TARGETS = [
  "new",
  "in_progress",
  "resolved",
  "closed",
  "discarded",
] as const;

type PendingAction =
  | { type: "status"; toStatus: (typeof STATUS_TARGETS)[number] }
  | { type: "assignee"; assignee: string | null };

// Barra fija de acciones masivas (paso 6.5) -- aparece cuando hay algo
// seleccionado (ver TicketInboxList, que mantiene el estado de selección y
// le pasa acá solo lo que esta barra necesita: cuántos, y CÓMO ejecutar
// sobre ellos -- nunca la lista completa de reclamos, esta barra no
// necesita saber título ni estado de nada, solo actuar).
//
// Confirmación SIEMPRE antes de ejecutar (pedido explícito -- "pensá en el
// error de haber seleccionado de más"): elegir un destino (estado o
// responsable) abre un diálogo con la cuenta exacta antes de tocar nada;
// cancelar no hace nada. El texto del diálogo de estado explica el
// comportamiento "se hace lo que se puede" ANTES de ejecutar, no como
// sorpresa después.
export function TicketBulkActionsBar({
  selectedCount,
  selection,
  assigneeOptions,
  onClear,
}: {
  selectedCount: number;
  selection: BulkTicketSelection;
  assigneeOptions: string[];
  onClear: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [assigneeInput, setAssigneeInput] = useState("");
  const [isSubmitting, startTransition] = useTransition();

  function describeResult(result: Extract<BulkActionResult, { ok: true }>) {
    const parts = [
      result.updatedCount === 1
        ? "1 reclamo actualizado"
        : `${result.updatedCount} reclamos actualizados`,
    ];
    if (result.skippedCount > 0) {
      parts.push(
        result.skippedCount === 1
          ? "1 sin cambios"
          : `${result.skippedCount} sin cambios`,
      );
    }
    if (result.notFoundCount > 0) {
      parts.push(
        result.notFoundCount === 1
          ? "1 ya no encontrado"
          : `${result.notFoundCount} ya no encontrados`,
      );
    }
    return parts.join(" · ");
  }

  function handleConfirm() {
    if (!pending) {
      return;
    }
    startTransition(async () => {
      const result =
        pending.type === "status"
          ? await bulkChangeTicketStatusAction({
              selection,
              toStatus: pending.toStatus,
            })
          : await bulkAssignTicketsAction({
              selection,
              assignee: pending.assignee,
            });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.updatedCount === 0) {
        toast.warning(`Ningún reclamo cambió (${describeResult(result)}).`);
      } else {
        toast.success(describeResult(result));
      }
      setPending(null);
      setAssigneeInput("");
      onClear();
      router.refresh();
    });
  }

  return (
    <>
      <div className="border-border bg-surface sticky bottom-4 z-10 flex flex-col gap-3 rounded-lg border p-3 shadow-lg sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-2">
          <span className="text-ink text-sm font-medium">
            {selectedCount === 1
              ? "1 reclamo seleccionado"
              : `${selectedCount} reclamos seleccionados`}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClear}
            aria-label="Cancelar selección"
          >
            <X aria-hidden="true" />
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Select
            value=""
            onValueChange={(value) =>
              setPending({
                type: "status",
                toStatus: value as (typeof STATUS_TARGETS)[number],
              })
            }
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Cambiar estado a…" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_TARGETS.map((status) => (
                <SelectItem key={status} value={status}>
                  {STATUS_LABEL[toBadgeStatus(status)]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex gap-2">
            <Input
              list="bulk-assignee-options"
              placeholder="Asignar a…"
              className="w-40"
              value={assigneeInput}
              onChange={(e) => setAssigneeInput(e.target.value)}
            />
            <datalist id="bulk-assignee-options">
              {assigneeOptions.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
            <Button
              type="button"
              variant="outline"
              disabled={!assigneeInput.trim()}
              onClick={() =>
                setPending({ type: "assignee", assignee: assigneeInput.trim() })
              }
            >
              Asignar
            </Button>
          </div>
        </div>
      </div>

      <Dialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
      >
        <DialogContent className="sm:max-w-sm">
          {pending && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {pending.type === "status"
                    ? `Cambiar el estado de ${selectedCount === 1 ? "1 reclamo" : `${selectedCount} reclamos`} a "${STATUS_LABEL[toBadgeStatus(pending.toStatus)]}"`
                    : `Asignar ${selectedCount === 1 ? "1 reclamo" : `${selectedCount} reclamos`} a "${pending.assignee}"`}
                </DialogTitle>
                <DialogDescription>
                  {pending.type === "status"
                    ? "Los reclamos que no puedan pasar a ese estado desde el que están ahora quedan sin cambios -- no se fuerza ninguna transición inválida."
                    : "Reemplaza el responsable actual de cada reclamo seleccionado."}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSubmitting}
                  onClick={() => setPending(null)}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleConfirm}
                >
                  {isSubmitting ? "Aplicando…" : "Confirmar"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
