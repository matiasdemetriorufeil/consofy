"use client";

import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { ManagedBuildingOption } from "../queries";
import { BuildingForm } from "./building-form";

// Un solo diálogo para alta y edición (paso 4.1, puntos 2 y 3): mismo
// formulario, mismo layout -- lo único que cambia es si `building` viene
// con datos o no. `key={building?.id ?? "new"}` fuerza a BuildingForm a
// remontarse cada vez que cambia el edificio objetivo (o se pasa de editar
// a crear), para que useForm/useActionState arranquen de cero con los
// defaultValues correctos en vez de arrastrar el estado del edificio
// anterior.
export function BuildingFormDialog({
  open,
  onOpenChange,
  building,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  building?: ManagedBuildingOption;
}) {
  const mode = building ? "edit" : "create";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "edit" ? "Editar edificio" : "Nuevo edificio"}
          </DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? "Los cambios se guardan para este edificio únicamente."
              : "Cargá los datos del edificio para empezar a gestionarlo."}
          </DialogDescription>
        </DialogHeader>
        <BuildingForm
          key={building?.id ?? "new"}
          building={building}
          onSuccess={() => {
            onOpenChange(false);
            toast.success(
              mode === "edit" ? "Edificio actualizado." : "Edificio creado.",
            );
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
