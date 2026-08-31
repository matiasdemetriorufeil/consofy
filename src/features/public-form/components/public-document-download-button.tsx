"use client";

import { Download } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { getPublicDocumentDownloadUrlAction } from "../actions";

// Descarga de un documento visible del edificio desde `/r/[token]/documentos`
// (paso 11.3) -- paralelo a `DocumentDownloadButton` del panel (10.4), con
// dos diferencias: la acción es la PÚBLICA (getPublicDocumentDownloadUrlAction,
// sin sesión) y hay que pasarle el `token` del edificio además del
// `documentId`. La URL firmada se pide BAJO DEMANDA al click, nunca se
// precalcula para todo el listado. La respuesta ya trae
// `Content-Disposition: attachment` (ver storage-objects.ts), así que el
// navegador la guarda sin navegar fuera de la página.
export function PublicDocumentDownloadButton({
  token,
  documentId,
  title,
}: {
  token: string;
  documentId: string;
  title: string;
}) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await getPublicDocumentDownloadUrlAction({
        token,
        documentId,
      });
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
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={isPending}
      aria-label={`Descargar «${title}»`}
    >
      <Download aria-hidden="true" />
      {isPending ? "Preparando…" : "Descargar"}
    </Button>
  );
}
