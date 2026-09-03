"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

// Error boundary de la página intermedia de organización (`/o/[token]`). Lo
// ve un VECINO, no el administrador (mismo perfil que `/r/[token]`): nada
// de jerga técnica ni de "ir al panel" (no tiene sesión ni le sirve). Mismo
// tono y estructura que src/app/r/[token]/error.tsx -- acá SÍ hay botón:
// un error de render suele ser pasajero (a diferencia de un enlace que no
// existe), así que "Reintentar" tiene sentido. Sin link a ningún lado: si
// el problema persiste, el paso útil es volver a abrir el link que le pasó
// su administración. No se muestra el detalle de la excepción -- solo
// console.error.
export default function OrganizationBuildingsError({
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
        Hubo un problema al abrir la lista de edificios. Puede ser algo
        momentáneo -- probá de nuevo en un momento.
      </p>
      <Button onClick={() => reset()}>Reintentar</Button>
    </div>
  );
}
