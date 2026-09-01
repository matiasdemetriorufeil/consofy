"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

// Error boundary del formulario público (`/r/[token]`). Lo ve un VECINO,
// no el administrador: nada de jerga técnica ni de "ir al panel" (no tiene
// sesión ni le sirve de nada). Mismo tono que `r/[token]/not-found.tsx`,
// pero acá SÍ hay un botón: un error de render suele ser pasajero (a
// diferencia de un enlace que no existe), así que "Reintentar" tiene
// sentido. Sin link a ningún lado -- el vecino no tiene "un adentro" al
// que volver; si el problema persiste, el paso útil es volver a abrir el
// link que le pasó su administración.
export default function PublicFormError({
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
    <div className="flex w-full max-w-sm flex-col items-center gap-3 px-4 text-center">
      <h1 className="text-ink font-display text-xl font-semibold">
        No pudimos cargar esta página
      </h1>
      <p className="text-ink-muted text-base">
        Hubo un problema al abrir el formulario. Puede ser algo momentáneo --
        probá de nuevo en un momento.
      </p>
      <Button onClick={() => reset()}>Reintentar</Button>
    </div>
  );
}
