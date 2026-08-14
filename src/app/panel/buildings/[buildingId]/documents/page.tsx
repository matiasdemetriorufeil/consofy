import { FileText } from "lucide-react";

import { EmptyState } from "@/components/empty-state";

// Placeholder a propósito (paso 4.2, punto 3): la gestión de documentos es
// una etapa futura del plan, todavía sin esquema de UI ni Server Actions
// propias. No hay ninguna consulta acá -- mostrar datos reales de
// `documents` sin la pantalla de gestión real detrás sería inventar UI de
// algo que no existe todavía, justo lo que el paso pide no hacer.
export default function BuildingDocumentsPage() {
  return (
    <EmptyState
      icon={FileText}
      title="La gestión de documentos todavía no está disponible"
      description="Vas a poder subir reglamentos, actas y otros archivos del edificio acá más adelante."
    />
  );
}
