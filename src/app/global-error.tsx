"use client";

// Solo se renderiza si el root layout mismo falla: reemplaza <html>/<body>
// por completo, así que no puede depender de layout.tsx ni de sus fuentes.
import "./globals.css";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es-AR">
      <body className="bg-canvas text-ink flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center antialiased">
        <p className="text-ink-muted font-mono text-sm">Error</p>
        <h1 className="text-2xl font-bold sm:text-3xl">
          La aplicación no cargó
        </h1>
        <p className="text-ink-muted max-w-sm text-base">
          Encontró un error inesperado.
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="bg-primary text-primary-fg rounded-md px-4 py-2 text-sm font-medium"
          >
            Reintentar
          </button>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- si el root layout falló, no confiamos en el router de next/link acá */}
          <a
            href="/"
            className="border-border text-ink rounded-md border px-4 py-2 text-sm font-medium"
          >
            Volver al inicio
          </a>
        </div>
      </body>
    </html>
  );
}
