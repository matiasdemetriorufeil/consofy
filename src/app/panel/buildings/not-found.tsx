import { Building2 } from "lucide-react";

import { EmptyState } from "@/components/empty-state";

// Vive en /panel/buildings/, un nivel POR ENCIMA de donde se llama
// notFound() (src/app/panel/buildings/[buildingId]/layout.tsx) -- no en el
// mismo segmento, a propósito. Probado en el navegador y confirmado con la
// documentación de Next.js: un not-found.tsx NO captura los notFound() que
// tira el layout.tsx de su PROPIO segmento, porque ese layout envuelve a su
// propio not-found.tsx en el árbol de render (así como envuelve a
// page.tsx) -- si el layout es el que falla, no hay forma de que también
// sea quien decide qué se muestra en su lugar. Recién el not-found.tsx del
// segmento PADRE (acá) puede reemplazar todo el subárbol de
// `[buildingId]/`, layout roto incluido. Primer intento real: puse este
// archivo junto al layout.tsx que llama notFound() y en el navegador cayó
// al `src/app/not-found.tsx` global (perdía el sidebar/header de /panel y
// el link volvía a "/" en vez de a "/panel/buildings") -- exactamente el
// síntoma de que Next.js no lo estaba usando y seguía subiendo hasta
// encontrar uno que si aplicara. Achá SÍ aplica: /panel/buildings/page.tsx
// (el listado) no llama notFound() nunca, así que este archivo no
// interfiere con el uso normal de esa página, solo con lo que cuelga de
// [buildingId]/. El layout de /panel (sidebar, header, selector) sigue
// renderizado alrededor, porque ese layout está un nivel más arriba
// todavía y nunca fue el que falló.
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
