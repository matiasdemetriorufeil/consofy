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
  getUnitDependencyCountsAction,
  softDeleteUnitAction,
} from "../actions";
import type { BuildingUnitRow, UnitDependencyCounts } from "../queries";

// Confirmación de baja (paso 4.3): mismo criterio que
// DeleteBuildingDialog (paso 4.1), pero acá los conteos no vienen ya
// cargados en la fila del listado (a propósito -- ver el comentario de
// getUnitDependencyCounts() en queries.ts: pedirlos para las 300 filas de
// un listado grande sería el N+1 que el proyecto evita en todos lados).
// Se piden recién al abrir ESTE diálogo, para ESTA unidad puntual.
export function DeleteUnitDialog({
  buildingId,
  unit,
  open,
  onOpenChange,
}: {
  buildingId: string;
  unit: BuildingUnitRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [counts, setCounts] = useState<UnitDependencyCounts | null>(null);

  // Sin rama para "reset al cerrar": el padre (UnitsList) desmonta este
  // diálogo por completo cuando se cierra (renderizado condicional, mismo
  // patrón que DeleteBuildingDialog en el paso 4.1) -- cada apertura es un
  // montaje nuevo, con `counts` ya en null por el useState de arriba, así
  // que no hace falta resetearlo a mano. Evita además un setState síncrono
  // en el cuerpo del efecto solo para volver atrás.
  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    getUnitDependencyCountsAction(unit.id).then((result) => {
      if (!cancelled) {
        setCounts(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, unit.id]);

  const label = unit.tower
    ? `${unit.tower} - ${unit.floor}°${unit.number}`
    : `${unit.floor}°${unit.number}`;

  function handleConfirm() {
    startTransition(async () => {
      const result = await softDeleteUnitAction(buildingId, unit.id);
      if (result.ok) {
        onOpenChange(false);
        toast.success(`Unidad "${label}" dada de baja.`);
      } else {
        toast.error(result.error ?? "No pudimos dar de baja la unidad.");
      }
    });
  }

  const hasWarnings =
    counts !== null &&
    (counts.activeOccupantsCount > 0 || counts.pendingTicketsCount > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Dar de baja &quot;{label}&quot;</DialogTitle>
          <DialogDescription>
            Deja de aparecer en el listado activo de unidades. Sus ocupantes y
            reclamos no se borran, pero quedan sin una unidad activa a la que
            pertenecer.
          </DialogDescription>
        </DialogHeader>

        {counts === null && (
          <p className="text-ink-muted text-sm">Revisando datos asociados…</p>
        )}

        {hasWarnings && (
          <Alert variant="destructive">
            <AlertDescription>
              {counts.activeOccupantsCount > 0 && (
                <p>
                  Tiene {counts.activeOccupantsCount}{" "}
                  {counts.activeOccupantsCount === 1
                    ? "ocupante vigente"
                    : "ocupantes vigentes"}
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
