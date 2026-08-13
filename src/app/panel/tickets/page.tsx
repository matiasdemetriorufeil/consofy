import { Inbox } from "lucide-react";

import { EmptyState } from "@/components/empty-state";

export default function TicketsPage() {
  return (
    <EmptyState
      icon={Inbox}
      title="Todavía no hay reclamos cargados"
      description="Acá va a aparecer la bandeja de reclamos de los vecinos, con su estado y prioridad, apenas alguien cargue el primero desde el formulario público."
    />
  );
}
