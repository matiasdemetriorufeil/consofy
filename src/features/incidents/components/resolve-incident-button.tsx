"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { resolveIncidentAction } from "../actions";

// Botón "Resolver incidente" (paso 7.5) -- único Client Component de
// /panel/incidents/[incidentId], mismo motivo que TicketActionsPanel/
// SimilarTicketBanner: necesita estado local (useTransition) y un handler
// de click.
//
// CRITERIO ELEGIDO para "el incidente ya está resuelto": el botón ni
// siquiera se renderiza (el caller, page.tsx, solo lo monta cuando
// `status === "open"`) -- en vez de deshabilitado o con un texto de error
// después de intentarlo, un incidente resuelto simplemente no ofrece la
// acción, mismo criterio ya usado en SimilarTicketBanner ("un candidato ya
// grouped no se sigue mostrando"). La Server Action IGUAL rechaza con un
// mensaje claro si de todos modos se invoca sobre un incidente ya resuelto
// (compare-and-swap contra status='open', ver actions.ts) -- defensa en
// profundidad, no solo la UI: nunca se confía en que el cliente ya filtró.
export function ResolveIncidentButton({ incidentId }: { incidentId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleResolve() {
    startTransition(async () => {
      const result = await resolveIncidentAction({ incidentId });
      if (result.ok) {
        toast.success(
          result.resolvedCount > 0
            ? `Problema en común resuelto. ${result.resolvedCount} reclamo(s) se resolvieron junto con él.`
            : "Problema en común resuelto.",
        );
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Button type="button" disabled={isPending} onClick={handleResolve}>
      {isPending ? "Resolviendo…" : "Resolver incidente"}
    </Button>
  );
}
