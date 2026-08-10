"use client";

import { useEffect } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function GlobalError({
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
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-ink-muted font-mono text-sm">Error</p>
      <h1 className="text-ink text-2xl font-bold sm:text-3xl">
        Hubo un error al cargar esta página
      </h1>
      <p className="text-ink-muted max-w-sm text-base">
        Podés reintentar la carga o volver al inicio.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Button onClick={() => reset()}>Reintentar</Button>
        <Button variant="outline" asChild>
          <Link href="/">Volver al inicio</Link>
        </Button>
      </div>
    </main>
  );
}
