import { Megaphone } from "lucide-react";

import { EmptyState } from "@/components/empty-state";

// Duplicado a propósito de ../not-found.tsx y ../preview/not-found.tsx --
// mismo motivo documentado ahí (paso 8.4): un `notFound()` tirado desde
// `send/page.tsx` no lo captura el `not-found.tsx` de una carpeta ANCESTRA
// sin `layout.tsx` propio, necesita el suyo en la MISMA carpeta.
export default function AnnouncementSendNotFound() {
  return (
    <EmptyState
      icon={Megaphone}
      title="No encontramos ese aviso"
      description="Puede que el link esté roto o que pertenezca a otra organización."
      action={{
        label: "Crear un aviso nuevo",
        href: "/panel/announcements/new",
      }}
    />
  );
}
