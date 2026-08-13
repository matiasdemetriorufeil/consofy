import { Bell } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BuildingSelector } from "@/features/buildings/components/building-selector";
import type { ActiveBuildingOption } from "@/features/buildings/queries";

import { MobileNavDrawer } from "./mobile-nav-drawer";
import { UserMenu } from "./user-menu";

export function SiteHeader({
  buildings,
  selectedBuildingId,
}: {
  buildings: ActiveBuildingOption[];
  selectedBuildingId: string | null;
}) {
  return (
    <header className="border-border bg-surface sticky top-0 z-20 flex h-14 items-center gap-3 border-b px-4">
      <MobileNavDrawer />
      <BuildingSelector
        buildings={buildings}
        selectedBuildingId={selectedBuildingId}
      />
      <div className="flex-1" />
      {/* Campana de notificaciones: espacio reservado para la etapa 9, sin
          implementar todavía -- deshabilitada a propósito, no es un botón
          que no hace nada por error. */}
      <Button
        variant="ghost"
        size="icon"
        disabled
        aria-label="Notificaciones (todavía no disponible)"
      >
        <Bell aria-hidden="true" />
      </Button>
      <UserMenu />
    </header>
  );
}
