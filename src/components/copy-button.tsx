"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";

// Extraído de public-link-panel.tsx (paso 4.6) en el paso 17.2, cuando la
// pantalla de Edificios sumó un segundo lugar que necesita "mostrar un valor
// y copiarlo con un botón": el enlace de /o/[token] a nivel de organización.
// Es UI genérica, sin conocimiento del dominio (no sabe qué es un edificio
// ni una organización), así que vive en src/components/ -- ver CLAUDE.md >
// Estructura de carpetas. El comportamiento es idéntico al que tenía inline
// en public-link-panel.tsx.
function useCopyToClipboard() {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API puede no estar disponible (contexto no seguro o permiso denegado).
    }
  }

  return { copied, copy };
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const { copied, copy } = useCopyToClipboard();

  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => copy(text)}
      aria-label={copied ? `${label} copiado` : label}
    >
      {copied ? (
        <Check className="text-resuelto" aria-hidden="true" />
      ) : (
        <Copy aria-hidden="true" />
      )}
      {copied ? "Copiado" : label}
    </Button>
  );
}
