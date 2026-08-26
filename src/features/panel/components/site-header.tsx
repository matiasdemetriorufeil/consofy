import { BuildingSelector } from "@/features/buildings/components/building-selector";
import type { ActiveBuildingOption } from "@/features/buildings/queries";
import { NotificationBell } from "@/features/notifications/components/notification-bell";

import { MobileNavDrawer } from "./mobile-nav-drawer";
import { UserMenu } from "./user-menu";

export function SiteHeader({
  buildings,
  selectedBuildingId,
  unreadNotificationCount,
}: {
  buildings: ActiveBuildingOption[];
  selectedBuildingId: string | null;
  unreadNotificationCount: number;
}) {
  return (
    <header className="border-border bg-surface sticky top-0 z-20 flex h-14 items-center gap-3 border-b px-4">
      <MobileNavDrawer />
      <BuildingSelector
        buildings={buildings}
        selectedBuildingId={selectedBuildingId}
      />
      <div className="flex-1" />
      {/* Paso 9.3 -- reemplaza el botón deshabilitado "espacio reservado
          para la etapa 9" que vivía acá desde el paso 3.4. */}
      <NotificationBell initialUnreadCount={unreadNotificationCount} />
      <UserMenu />
    </header>
  );
}
