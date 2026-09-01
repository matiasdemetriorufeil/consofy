"use client";

import { useEffect } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

// Error boundary de la vista de seguimiento del reclamo (`/s/[token]`).
// Quien la abre casi siempre es el administrador desde WhatsApp, pero
// también puede ser el vecino (el link de seguimiento de la pantalla de
// confirmación, paso 5.8) -- así que el texto queda neutro, sin jerga.
// Mismo criterio que `s/[token]/not-found.tsx`: incluye un puntero de
// vuelta al panel (a diferencia de `/r/[token]`), útil para el
// administrador y inofensivo para el vecino (lo llevaría al login).
//
// No se muestra el detalle de la excepción -- solo `console.error`.
export default function TicketStatusError({
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
        No pudimos cargar el seguimiento
      </h1>
      <p className="text-ink-muted text-base">
        Hubo un problema al abrir esta página. Puede ser algo momentáneo --
        probá de nuevo.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={() => reset()}>Reintentar</Button>
        <Button variant="outline" asChild>
          <Link href="/panel">Ir al panel</Link>
        </Button>
      </div>
    </div>
  );
}
