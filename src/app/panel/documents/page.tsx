import { FileText } from "lucide-react";

import { EmptyState } from "@/components/empty-state";

export default function DocumentsPage() {
  return (
    <EmptyState
      icon={FileText}
      title="Todavía no hay documentos"
      description="Acá vas a poder subir actas, reglamentos y otros archivos, organizados por edificio."
    />
  );
}
