import { Megaphone } from "lucide-react";

import { EmptyState } from "@/components/empty-state";

// Duplicado a propósito de ../not-found.tsx, no reutilizado -- encontrado
// probando este mismo paso (8.4), no asumido de la documentación de
// Next.js: un `notFound()` tirado desde `preview/page.tsx` NO lo capturaba
// el `not-found.tsx` de `[announcementId]/` (la carpeta padre, sin
// `layout.tsx` propio) -- en vez de eso, la respuesta real era el 404
// genérico de toda la app ("Esta página no existe", el de
// `src/app/not-found.tsx`), confirmado con una captura de pantalla real
// contra un `announcementId` inventado. `/panel/tickets/[ticketId]/
// not-found.tsx` sí funciona sin este problema porque su `page.tsx` que
// llama `notFound()` vive en la MISMA carpeta que ese `not-found.tsx` --
// acá el `page.tsx` que llama `notFound()` es el de `preview/`, una
// carpeta hija distinta de donde vive `../not-found.tsx`, así que
// necesita su PROPIA copia. Sin este archivo, la pantalla de error para un
// link de vista previa roto no tenía ningún mensaje específico sobre
// avisos.
export default function AnnouncementPreviewNotFound() {
  return (
    <EmptyState
      icon={Megaphone}
      title="No encontramos ese borrador"
      description="Puede que el link esté roto, que el aviso ya se haya enviado, o que pertenezca a otra organización."
      action={{
        label: "Crear un aviso nuevo",
        href: "/panel/announcements/new",
      }}
    />
  );
}
