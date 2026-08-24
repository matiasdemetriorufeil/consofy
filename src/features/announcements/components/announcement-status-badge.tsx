import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { AnnouncementStatus } from "../queries";

// Mismo criterio que StatusBadge de tickets (paso 6.1) -- un mapa de label
// y un mapa de color por estado, reusando los mismos tokens semánticos ya
// definidos en globals.css (no hace falta inventar colores nuevos).
export const ANNOUNCEMENT_STATUS_LABEL: Record<AnnouncementStatus, string> = {
  draft: "Borrador",
  // No alcanzable por ningún flujo construido hasta ahora (no existe
  // programación de envíos todavía) -- el enum ya lo define desde la
  // etapa 2.5 y hay datos de seed con este valor, así que el badge lo
  // traduce igual en vez de dejarlo sin label.
  scheduled: "Programado",
  sending: "Enviando",
  sent: "Enviado",
  // Tampoco alcanzable hoy (ver CLAUDE.md > Pantalla de envío manual, paso
  // 8.5: "'failed' a nivel AVISO... no tiene ningún escenario que lo
  // dispare hoy"), mismo motivo que "scheduled".
  failed: "Fallido",
};

const ANNOUNCEMENT_STATUS_CLASS: Record<AnnouncementStatus, string> = {
  draft: "bg-baja/10 text-baja",
  scheduled: "bg-media/10 text-media",
  sending: "bg-alta/10 text-alta",
  sent: "bg-resuelto/10 text-resuelto",
  failed: "bg-urgente/10 text-urgente",
};

export function AnnouncementStatusBadge({
  status,
  className,
}: {
  status: AnnouncementStatus;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-body border-transparent",
        ANNOUNCEMENT_STATUS_CLASS[status],
        className,
      )}
    >
      {ANNOUNCEMENT_STATUS_LABEL[status]}
    </Badge>
  );
}
