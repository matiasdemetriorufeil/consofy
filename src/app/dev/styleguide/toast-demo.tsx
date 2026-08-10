"use client";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function ToastDemo() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        onClick={() =>
          toast.success("Reclamo TC-2026-0143 marcado como resuelto.")
        }
      >
        Mostrar éxito
      </Button>
      <Button
        variant="outline"
        onClick={() => toast.error("No se pudo enviar el mensaje de WhatsApp.")}
      >
        Mostrar error
      </Button>
    </div>
  );
}
