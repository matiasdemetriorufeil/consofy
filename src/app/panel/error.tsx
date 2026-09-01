"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

// Error boundary del panel: reemplaza el CONTENIDO de la pantalla, pero
// como vive dentro de `src/app/panel/layout.tsx`, el sidebar / header /
// selector de edificio siguen renderizados alrededor -- el administrador no
// queda "afuera" de la app, solo se le rompió la sección que estaba
// mirando. Un `error.tsx` de segmento NO captura errores del layout de su
// propio segmento; si `panel/layout.tsx` mismo falla (ej. la base no
// responde al resolver la sesión), sube al `src/app/error.tsx` global.
//
// No se muestra el mensaje de la excepción ni el stack -- eso va a
// `console.error` nada más. El texto es genérico a propósito: el
// administrador no puede hacer nada con "TypeError: undefined is not a
// function", y verlo solo genera ruido.
export default function PanelError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-center">
      <AlertTriangle className="text-ink-muted size-8" aria-hidden="true" />
      <div className="space-y-1">
        <h1 className="text-ink font-display text-lg font-semibold">
          Algo salió mal en esta pantalla
        </h1>
        <p className="text-ink-muted max-w-sm text-sm">
          Hubo un error inesperado al cargar esta sección. Puede ser algo
          pasajero -- probá de nuevo.
        </p>
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Button onClick={() => reset()}>Reintentar</Button>
        <Button variant="outline" asChild>
          <Link href="/panel">Ir al inicio del panel</Link>
        </Button>
      </div>
    </div>
  );
}
