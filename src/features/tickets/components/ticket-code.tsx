"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

import { cn } from "@/lib/utils";

interface TicketCodeProps {
  code: string;
  className?: string;
}

export function TicketCode({ code, className }: TicketCodeProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API puede no estar disponible (contexto no seguro o permiso denegado).
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        "border-border bg-surface text-ink hover:bg-canvas focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-xs font-medium tracking-wide transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
        className,
      )}
      aria-label={copied ? `Código ${code} copiado` : `Copiar código ${code}`}
    >
      {code}
      {copied ? (
        <Check className="text-resuelto size-3.5" aria-hidden="true" />
      ) : (
        <Copy className="text-ink-muted size-3.5" aria-hidden="true" />
      )}
    </button>
  );
}
