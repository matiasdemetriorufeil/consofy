"use client";

import { Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ActiveBuildingOption } from "@/features/buildings/queries";

import { DocumentUploadForm } from "./document-upload-form";

// El alta del paso 10.1 pasa a un diálogo detrás de un botón "Subir
// documento" arriba de la lista -- mismo patrón que /panel/announcements
// ("Crear aviso") y /panel/reminders (ReminderFormDialog): en una pantalla
// de listado, "crear" es una acción secundaria detrás de un botón, no un
// formulario que compite por el espacio con lo que se viene a mirar. El
// formulario en sí (DocumentUploadForm) no cambia -- se reusa tal cual.
export function UploadDocumentButton({
  buildingOptions,
  lockedBuildingId,
}: {
  buildingOptions: ActiveBuildingOption[];
  lockedBuildingId: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Upload aria-hidden="true" />
          Subir documento
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Subir un documento</DialogTitle>
          <DialogDescription>
            {lockedBuildingId
              ? "Se guarda en el edificio elegido en el encabezado."
              : "Elegí a qué edificio pertenece."}
          </DialogDescription>
        </DialogHeader>
        {/* key: fuerza a remontar el formulario cada vez que el diálogo se
            reabre, para que su estado interno (categoría elegida, error de
            archivo) arranque limpio -- mismo criterio que el key de
            ReminderFormDialog. */}
        <DocumentUploadForm
          key={open ? "open" : "closed"}
          buildingOptions={buildingOptions}
          lockedBuildingId={lockedBuildingId}
          onSuccess={() => {
            setOpen(false);
            toast.success("Documento subido.");
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
