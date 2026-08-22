import { Layers } from "lucide-react";

import { EmptyState } from "@/components/empty-state";

// Mismo criterio de ambigüedad que /panel/tickets/[ticketId]/not-found.tsx:
// no distingue "no existe", "es de otra organización" ni "se fusionó hacia
// otro incidente y quedó soft-borrado" (ver getIncidentDetail,
// incidents/queries.ts) -- las tres caen acá.
export default function IncidentNotFound() {
  return (
    <EmptyState
      icon={Layers}
      title="No encontramos ese problema en común"
      description="Puede que el link esté roto, que se haya fusionado con otro problema en común, o que pertenezca a otra organización."
      action={{ label: "Volver a la bandeja", href: "/panel/tickets" }}
    />
  );
}
