import { Megaphone } from "lucide-react";

import { EmptyState } from "@/components/empty-state";

// Paso 8.2 -- conecta la acción real del EmptyState con el constructor de
// segmentos nuevo. Sigue mostrando SIEMPRE este vacío (no hay listado de
// avisos todavía, eso es un paso posterior) aunque ya existan borradores
// creados -- documentado como límite conocido del paso, no un olvido: el
// enunciado de 8.2 pide el constructor de segmentos, no la pantalla de
// listado.
export default function AnnouncementsPage() {
  return (
    <EmptyState
      icon={Megaphone}
      title="Todavía no hay avisos"
      description="Acá vas a poder escribir un aviso y mandarlo a los vecinos de uno o varios edificios."
      action={{ label: "Crear aviso", href: "/panel/announcements/new" }}
    />
  );
}
