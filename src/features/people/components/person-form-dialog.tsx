"use client";

import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { BuildingOccupancyRow } from "../queries";
import { PersonForm } from "./person-form";

export function PersonFormDialog({
  open,
  onOpenChange,
  person,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  person: BuildingOccupancyRow;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar vecino</DialogTitle>
          <DialogDescription>
            Los cambios se guardan para este vecino en todas las unidades que
            ocupa.
          </DialogDescription>
        </DialogHeader>
        <PersonForm
          key={person.personId}
          person={person}
          onSuccess={() => {
            onOpenChange(false);
            toast.success("Vecino actualizado.");
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
