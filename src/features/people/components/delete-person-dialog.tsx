"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  getPersonDependencyCountsAction,
  softDeletePersonAction,
} from "../actions";
import type { BuildingOccupancyRow, PersonDependencyCounts } from "../queries";

// Confirmación de baja de un vecino (paso 4.4 -- decisión 2 del reporte):
// mismo criterio que DeleteUnitDialog (paso 4.3) -- los conteos no vienen
// ya cargados en la fila (evitaría el N+1 de siempre), se piden recién al
// abrir ESTE diálogo. A diferencia de la unidad, acá los conteos son de
// TODA la organización, no solo de este edificio (ver el comentario de
// getPersonDependencyCounts en queries.ts): dar de baja a la persona la
// afecta en cualquier edificio donde tenga ocupaciones.
export function DeletePersonDialog({
  person,
  open,
  onOpenChange,
}: {
  person: BuildingOccupancyRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [counts, setCounts] = useState<PersonDependencyCounts | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    getPersonDependencyCountsAction(person.personId).then((result) => {
      if (!cancelled) {
        setCounts(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, person.personId]);

  const label = `${person.firstName} ${person.lastName ?? ""}`.trim();

  function handleConfirm() {
    startTransition(async () => {
      const result = await softDeletePersonAction(person.personId);
      if (result.ok) {
        onOpenChange(false);
        toast.success(`"${label}" dado de baja.`);
      } else {
        toast.error(result.error ?? "No pudimos dar de baja al vecino.");
      }
    });
  }

  const hasWarnings =
    counts !== null &&
    (counts.activeOccupanciesCount > 0 || counts.pendingTicketsCount > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Dar de baja a &quot;{label}&quot;</DialogTitle>
          <DialogDescription>
            Deja de aparecer en cualquier listado activo. Sus ocupaciones y
            reclamos no se borran, pero quedan asociados a un vecino dado de
            baja.
          </DialogDescription>
        </DialogHeader>

        {counts === null && (
          <p className="text-ink-muted text-sm">Revisando datos asociados…</p>
        )}

        {hasWarnings && (
          <Alert variant="destructive">
            <AlertDescription>
              {counts.activeOccupanciesCount > 0 && (
                <p>
                  Tiene {counts.activeOccupanciesCount}{" "}
                  {counts.activeOccupanciesCount === 1
                    ? "ocupación vigente"
                    : "ocupaciones vigentes"}
                  .
                </p>
              )}
              {counts.pendingTicketsCount > 0 && (
                <p>
                  Tiene {counts.pendingTicketsCount}{" "}
                  {counts.pendingTicketsCount === 1
                    ? "reclamo pendiente"
                    : "reclamos pendientes"}{" "}
                  sin resolver.
                </p>
              )}
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isPending || counts === null}
            onClick={handleConfirm}
          >
            {isPending ? "Dando de baja…" : "Dar de baja"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
