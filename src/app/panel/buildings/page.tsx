import { Building2 } from "lucide-react";

import { EmptyState } from "@/components/empty-state";

export default function BuildingsPage() {
  return (
    <EmptyState
      icon={Building2}
      title="Todavía no se pueden gestionar edificios desde acá"
      description="Esta sección va a mostrar los edificios de tu organización, con sus datos y el link al formulario público de cada uno."
    />
  );
}
