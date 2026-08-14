"use client";

import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { BuildingUnitRow } from "@/features/units/queries";

import { PersonOccupancyForm } from "./person-occupancy-form";

// Diálogo de alta (paso 4.4): siempre "nuevo", nunca edición -- editar una
// persona (EditPersonDialog) y editar una ocupación (no soportado, se
// cierra y se crea una nueva) son acciones separadas.
export function PersonOccupancyDialog({
  open,
  onOpenChange,
  buildingId,
  units,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildingId: string;
  units: BuildingUnitRow[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Agregar vecino</DialogTitle>
          <DialogDescription>
            Buscá por teléfono primero -- si el vecino ya está cargado, lo vas a
            poder asignar directo a la unidad sin volver a completar sus datos.
          </DialogDescription>
        </DialogHeader>
        <PersonOccupancyForm
          key={open ? "open" : "closed"}
          buildingId={buildingId}
          units={units}
          onSuccess={() => {
            onOpenChange(false);
            toast.success("Vecino agregado a la unidad.");
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
