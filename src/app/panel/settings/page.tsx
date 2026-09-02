import { ChevronRight, CopyCheck } from "lucide-react";
import Link from "next/link";

// Índice de "Configuración" (nav del panel). Hasta el paso 14.5 era un
// placeholder vacío; ahora lista las secciones de configuración
// disponibles. Por ahora una sola -- la evaluación de la detección de
// duplicados (14.5). A medida que haya más (datos de la organización,
// preferencias del panel), se agregan como más filas de esta lista.
const SETTINGS_SECTIONS = [
  {
    href: "/panel/settings/duplicate-detection",
    icon: CopyCheck,
    title: "Detección de duplicados",
    description:
      "Histórico de sugerencias de posible duplicado agrupadas y descartadas, para calibrar el umbral de la detección.",
  },
];

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-ink font-display text-xl font-semibold">
        Configuración
      </h1>
      <ul className="flex flex-col gap-3">
        {SETTINGS_SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <li key={section.href}>
              <Link
                href={section.href}
                className="border-border hover:bg-secondary/50 focus-visible:ring-ring/50 flex items-start gap-4 rounded-lg border p-4 transition-colors outline-none focus-visible:ring-3"
              >
                <Icon
                  className="text-ink-muted mt-0.5 size-5 shrink-0"
                  aria-hidden="true"
                />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-ink font-medium">{section.title}</span>
                  <span className="text-ink-muted text-sm">
                    {section.description}
                  </span>
                </div>
                <ChevronRight
                  className="text-ink-muted mt-0.5 ml-auto size-4 shrink-0"
                  aria-hidden="true"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
