"use client";

import { useState, useTransition } from "react";
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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { closeOccupancyAction } from "../actions";
import type { BuildingOccupancyRow } from "../queries";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Cierre de una ocupación (paso 4.4 -- decisión 3 del reporte): un vecino
// que se mudó no se borra, su ocupación VIGENTE pasa a tener `ended_on` y
// queda como historial. Fecha default hoy, editable para backdatear (mismo
// criterio que reported_at en tickets -- un administrador puede estar
// cargando esto días después de la mudanza real).
export function CloseOccupancyDialog({
  buildingId,
  occupancy,
  open,
  onOpenChange,
}: {
  buildingId: string;
  occupancy: BuildingOccupancyRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [endedOn, setEndedOn] = useState(today());
  const [error, setError] = useState<string | null>(null);

  const label = occupancy.unitTower
    ? `${occupancy.unitTower} - ${occupancy.unitFloor}°${occupancy.unitNumber}`
    : `${occupancy.unitFloor}°${occupancy.unitNumber}`;

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await closeOccupancyAction({
        occupancyId: occupancy.occupancyId,
        buildingId,
        endedOn,
      });
      if (result.ok) {
        onOpenChange(false);
        toast.success(
          `Se finalizó la ocupación de ${occupancy.firstName} en ${label}.`,
        );
      } else {
        setError(result.error ?? "No pudimos finalizar la ocupación.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Finalizar ocupación</DialogTitle>
          <DialogDescription>
            {occupancy.firstName} {occupancy.lastName ?? ""} deja de figurar
            como ocupante vigente de {label}. Queda en el historial de la
            unidad, no se borra.
          </DialogDescription>
        </DialogHeader>

        <Field data-invalid={!!error}>
          <FieldLabel htmlFor="close-occupancy-ended-on">
            Fecha de fin
          </FieldLabel>
          <Input
            id="close-occupancy-ended-on"
            type="date"
            value={endedOn}
            onChange={(event) => setEndedOn(event.target.value)}
            disabled={isPending}
          />
          <FieldError errors={error ? [{ message: error }] : []} />
        </Field>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="button" disabled={isPending} onClick={handleConfirm}>
            {isPending ? "Finalizando…" : "Finalizar ocupación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
