"use client";

import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { BuildingUnitRow } from "../queries";
import { UnitForm } from "./unit-form";

// Un solo diálogo para alta y edición, mismo criterio que
// BuildingFormDialog (paso 4.1). `key={unit?.id ?? "new"}` fuerza a
// UnitForm a remontarse al cambiar de unidad objetivo.
export function UnitFormDialog({
  open,
  onOpenChange,
  buildingId,
  unit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildingId: string;
  unit?: BuildingUnitRow;
}) {
  const mode = unit ? "edit" : "create";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "edit" ? "Editar unidad" : "Nueva unidad"}
          </DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? "Los cambios se guardan para esta unidad únicamente."
              : "Cargá los datos de la unidad."}
          </DialogDescription>
        </DialogHeader>
        <UnitForm
          key={unit?.id ?? "new"}
          buildingId={buildingId}
          unit={unit}
          onSuccess={() => {
            onOpenChange(false);
            toast.success(
              mode === "edit" ? "Unidad actualizada." : "Unidad creada.",
            );
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
