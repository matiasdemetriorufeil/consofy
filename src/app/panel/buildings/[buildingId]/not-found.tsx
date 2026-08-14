import { Building2 } from "lucide-react";

import { EmptyState } from "@/components/empty-state";

// Colocado junto al layout.tsx de este mismo segmento (paso 4.2): cuando
// layout.tsx llama a notFound(), Next.js usa ESTE archivo -- no el
// src/app/not-found.tsx global -- porque está en el mismo segmento donde
// se lanzó. El layout de /panel (sidebar, header, selector) sigue
// renderizado alrededor, a diferencia del global, que hubiera reemplazado
// TODA la página incluido el panel. El link vuelve a "/panel/buildings"
// (el listado), no a "/" como hace el global -- para un administrador ya
// logueado en el panel, mandarlo a la landing pública sería perder el
// lugar de donde venía.
export default function BuildingNotFound() {
  return (
    <EmptyState
      icon={Building2}
      title="No encontramos ese edificio"
      description="Puede que el link esté roto, que el edificio se haya dado de baja, o que pertenezca a otra organización."
      action={{ label: "Volver a edificios", href: "/panel/buildings" }}
    />
  );
}
