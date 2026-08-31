"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Confirmación para pasar un documento de "privado" a "visible para
// vecinos" (paso 10.3). SOLO esta dirección pide confirmación -- exponer un
// documento hacia afuera es el riesgo (R7 del plan, Ley 25.326); volver a
// privado (restringir) no. El texto dice QUÉ documento y QUÉ va a poder
// ver un vecino a partir de ahora, para que un click accidental no lo
// exponga.
export function MakeDocumentVisibleDialog({
  open,
  onOpenChange,
  title,
  categoryLabel,
  buildingName,
  isPending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  categoryLabel: string;
  buildingName: string;
  isPending: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Hacer visible &quot;{title}&quot;</DialogTitle>
          <DialogDescription>
            Los vecinos del edificio {buildingName} van a poder ver y descargar
            este documento ({categoryLabel}). Antes de hacerlo visible, revisá
            que no incluya datos personales de terceros ni información interna
            de la administración.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="button" disabled={isPending} onClick={onConfirm}>
            {isPending ? "Guardando…" : "Sí, hacer visible"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
