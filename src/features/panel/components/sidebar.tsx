import { PanelNav } from "./panel-nav";

// Fijo en desktop, oculto en mobile (el drawer de mobile-nav-drawer.tsx lo
// reemplaza ahí). "fixed" + inset-y-0, no solo "sticky": tiene que quedar
// quieto incluso si el contenido principal es más alto que la pantalla y
// scrollea -- ver el contexto del paso 3.4 sobre que la navegación no se
// puede mover.
export function Sidebar() {
  return (
    <div className="border-border bg-surface fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r px-3 py-4 md:flex">
      <div className="text-ink font-display px-3 pb-4 text-lg font-bold">
        Consofy
      </div>
      <PanelNav />
    </div>
  );
}
