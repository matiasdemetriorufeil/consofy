import { Inbox } from "lucide-react";

import { EmptyState } from "@/components/empty-state";

// A diferencia de /panel/buildings/[buildingId] (donde notFound() lo tira
// un layout.tsx, así que este archivo tuvo que subir un nivel -- ver el
// comentario de src/app/panel/buildings/not-found.tsx), acá notFound() lo
// tira directamente page.tsx de ESTE MISMO segmento, sin ningún layout
// propio en el medio -- así que este not-found.tsx SÍ captura ese caso
// desde la misma carpeta: el layout de /panel (sidebar, header, selector)
// sigue renderizado alrededor, porque nunca fue el que falló.
export default function TicketNotFound() {
  return (
    <EmptyState
      icon={Inbox}
      title="No encontramos ese reclamo"
      description="Puede que el link esté roto, que el reclamo se haya dado de baja, o que pertenezca a otra organización."
      action={{ label: "Volver a la bandeja", href: "/panel/tickets" }}
    />
  );
}
