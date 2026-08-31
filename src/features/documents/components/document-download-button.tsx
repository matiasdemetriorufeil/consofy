"use client";

import { Download } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { getDocumentDownloadUrlAction } from "../actions";

// Botón de descarga por fila (paso 10.4) -- reemplaza la afordancia
// deshabilitada del 10.2. La URL firmada se pide BAJO DEMANDA (al click),
// nunca se precalcula ni viaja en una prop: `DocumentList` sigue siendo
// Server Component y este es un Client Component chico, mismo criterio que
// DocumentVisibilityControl (paso 10.3).
//
// Con la URL firmada devuelta por la acción se dispara la descarga con un
// `<a>` temporal (mismo patrón que `downloadTemplate` en import-dialog.tsx).
// La respuesta de esa URL ya trae `Content-Disposition: attachment;
// filename="<nombre original>"` (opción `download` al firmar, ver
// storage-objects.ts), así que el navegador la GUARDA con el nombre real
// sin navegar fuera de la página.
export function DocumentDownloadButton({
  documentId,
  title,
}: {
  documentId: string;
  title: string;
}) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await getDocumentDownloadUrlAction({ documentId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const link = document.createElement("a");
      link.href = result.url;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    });
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={handleClick}
      disabled={isPending}
      aria-label={`Descargar "${title}"`}
      title={`Descargar "${title}"`}
    >
      <Download aria-hidden="true" />
    </Button>
  );
}
