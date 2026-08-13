import type { LucideIcon } from "lucide-react";

// Genérico a propósito, sin saber qué es un "reclamo" o un "edificio" --
// ver CLAUDE.md > Estructura de carpetas. Cada página placeholder del
// panel (paso 3.4, punto 5) le pasa su propio ícono/texto: acá solo vive
// el layout compartido de "no hay nada todavía, y esto es lo que va a
// haber".
export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="border-border flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center">
      <Icon className="text-ink-muted size-8" aria-hidden="true" />
      <div className="space-y-1">
        <h2 className="text-ink font-display text-lg font-semibold">{title}</h2>
        <p className="text-ink-muted max-w-sm text-sm">{description}</p>
      </div>
    </div>
  );
}
