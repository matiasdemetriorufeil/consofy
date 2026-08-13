"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { panelNavItems } from "../nav-items";

// Compartido entre el sidebar fijo de desktop y el drawer de mobile (ver
// sidebar.tsx y mobile-nav-drawer.tsx): una sola lista, un solo criterio
// de "activo", nunca dos implementaciones que se puedan desincronizar.
export function PanelNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Secciones del panel" className="flex flex-col gap-0.5">
      {panelNavItems.map((item) => {
        // /panel es la home: con startsWith solo, "/panel" matchearía
        // como activo en CUALQUIER subruta (/panel/tickets también
        // empieza con "/panel"). El resto sí usa startsWith a propósito,
        // para que una sub-página tipo /panel/tickets/123 deje "Reclamos"
        // marcado como activo.
        const isActive =
          item.href === "/panel"
            ? pathname === "/panel"
            : pathname.startsWith(item.href);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              "focus-visible:ring-ring/50 outline-none focus-visible:ring-3",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-ink-muted hover:bg-secondary hover:text-ink",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
