"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { materializeAnnouncementRecipientsAction } from "../actions";

// Dispara la materialización de destinatarios (paso 8.5) UNA SOLA VEZ,
// dentro de un `useEffect` -- a propósito, NO directo en el Server
// Component de la página. Un `useEffect` solo corre cuando el componente
// efectivamente MONTA tras una navegación real del navegador -- el
// prefetch de `<Link>` (que Next.js dispara solo con pasar el mouse por
// encima o con el link entrando en viewport) NO ejecuta efectos de
// cliente, así que este mecanismo no puede materializar destinatarios (ni
// pasar el aviso a 'sending') solo porque alguien pasó el mouse sobre un
// link hacia esta pantalla sin llegar a abrirla. Si la materialización
// viviera directo en el Server Component (evaluada en cada GET), un
// prefetch la hubiera disparado en silencio -- encontrado pensando el
// diseño de este paso, no en producción, pero es un riesgo real que este
// patrón evita de raíz.
export function MaterializeOnMount({
  announcementId,
}: {
  announcementId: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    materializeAnnouncementRecipientsAction(announcementId).then((result) => {
      if (cancelled) {
        return;
      }
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [announcementId, router]);

  if (error) {
    return <p className="text-destructive text-sm">{error}</p>;
  }
  return (
    <p className="text-ink-muted text-sm">
      Preparando la lista de destinatarios…
    </p>
  );
}
