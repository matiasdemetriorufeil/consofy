import { Home } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PanelGreeting } from "@/features/auth/components/panel-greeting";

// Ya no llama a requireUser() acá: el layout de /panel (padre) ya lo hizo
// y empujó el resultado al contexto que lee PanelGreeting -- ver
// src/features/auth/panel-user-context.tsx.
export default function PanelHomePage() {
  return (
    <div className="flex flex-col gap-6">
      <PanelGreeting />
      <EmptyState
        icon={Home}
        title="Todavía no hay novedades para mostrar"
        description="Cuando se carguen reclamos y avisos, acá vas a ver un resumen: lo pendiente, lo vencido y lo reciente de tus edificios."
      />
    </div>
  );
}
