import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-ink-muted font-mono text-sm">404</p>
      <h1 className="text-ink text-2xl font-bold sm:text-3xl">
        Esta página no existe
      </h1>
      <p className="text-ink-muted max-w-sm text-base">
        La dirección no corresponde a ninguna sección de Consofy.
      </p>
      <Button asChild className="mt-2">
        <Link href="/">Volver al inicio</Link>
      </Button>
    </main>
  );
}
