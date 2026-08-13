import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

// Genérico a propósito, sin saber qué es un "reclamo" o un "edificio" --
// ver CLAUDE.md > Estructura de carpetas. Cada página placeholder del
// panel (paso 3.4, punto 5) le pasa su propio ícono/texto: acá solo vive
// el layout compartido de "no hay nada todavía, y esto es lo que va a
// haber".
//
// `action` es opcional: paso 3.4 no lo necesitaba (ninguna sección tenía
// todavía un flujo real al que llevar), paso 3.5 sí -- el vacío real del
// dashboard ("no hay ningún edificio cargado") es una invitación a actuar,
// no solo un cartel, según CLAUDE.md > Voz y escritura.
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="border-border flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center">
      <Icon className="text-ink-muted size-8" aria-hidden="true" />
      <div className="space-y-1">
        <h2 className="text-ink font-display text-lg font-semibold">{title}</h2>
        <p className="text-ink-muted max-w-sm text-sm">{description}</p>
      </div>
      {action && (
        <Button asChild className="mt-2">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      )}
    </div>
  );
}
