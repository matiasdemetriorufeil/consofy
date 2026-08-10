"use client";

import { useEffect } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function ErrorPage({
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
        Esta página no cargó
      </h1>
      <p className="text-ink-muted max-w-sm text-base">
        Encontró un error inesperado.
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
