"use client";

import { useTransition } from "react";
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

import { softDeleteBuildingAction } from "../actions";
import type { ManagedBuildingOption } from "../queries";

// Confirmación de baja (paso 4.1, punto 4): explica en el propio diálogo
// qué pasa con las unidades y los reclamos asociados (nada se borra, dejan
// de estar vinculados a un edificio que aparezca en los listados), y si el
// edificio tiene reclamos pendientes lo dice de forma explícita -- ambos
// datos ya vienen en `building` (la misma fila que ya cargó el listado),
// sin pedir nada nuevo al servidor solo para mostrar este diálogo.
export function DeleteBuildingDialog({
  building,
  open,
  onOpenChange,
}: {
  building: ManagedBuildingOption;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const result = await softDeleteBuildingAction(building.id);
      if (result.ok) {
        onOpenChange(false);
        toast.success(`"${building.name}" se dio de baja.`);
      } else {
        toast.error(result.error ?? "No pudimos dar de baja el edificio.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Dar de baja &quot;{building.name}&quot;</DialogTitle>
          <DialogDescription>
            Deja de aparecer en el listado activo y en el selector de edificios.
            Sus {building.unitsCount}{" "}
            {building.unitsCount === 1 ? "departamento" : "departamentos"} y sus
            reclamos no se borran, pero quedan sin un edificio activo al que
            pertenecer.
          </DialogDescription>
        </DialogHeader>
        {building.pendingTicketsCount > 0 && (
          <Alert variant="destructive">
            <AlertDescription>
              Tiene {building.pendingTicketsCount}{" "}
              {building.pendingTicketsCount === 1
                ? "reclamo pendiente"
                : "reclamos pendientes"}{" "}
              sin resolver.
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
            disabled={isPending}
            onClick={handleConfirm}
          >
            {isPending ? "Dando de baja…" : "Dar de baja"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
