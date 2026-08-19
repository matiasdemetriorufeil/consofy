// Cubre DOS casos con el mismo mensaje, a propósito (ver page.tsx): token
// mal formado o inexistente, y reclamo cuyo edificio fue dado de baja --
// mismo criterio de ambigüedad que /r/[token] (ver ese not-found.tsx):
// nada distingue "nunca existió" de "existió y el edificio se dio de
// baja" para quien mira la pantalla.
//
// Quien llega acá casi siempre es el administrador, tocando el link desde
// WhatsApp -- a diferencia de /r/[token] (vecino sin ningún "adentro" al
// que volver), acá SÍ tiene sentido un puntero de vuelta a algo útil: el
// panel, que es justo donde puede buscar el reclamo por su cuenta si el
// link no funcionó.
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function TicketAttachmentsGalleryNotFound() {
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-3 px-4 text-center">
      <h1 className="text-ink font-display text-xl font-semibold">
        No encontramos este enlace
      </h1>
      <p className="text-ink-muted text-base">
        Puede que esté mal escrito o que ya no esté disponible.
      </p>
      <Button asChild variant="outline">
        <Link href="/panel">Ir al panel</Link>
      </Button>
    </div>
  );
}
