"use client";

import { Copy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { resolveSimilarityCandidateAction } from "../actions";
import type { PendingSimilarityCandidate } from "../queries";
import type { SimilarityResolution } from "../ticket-actions-schema";

// Banner de posible duplicado (paso 7.3) -- único Client Component nuevo
// de esta pantalla (el resto de /panel/tickets/[ticketId] sigue siendo
// Server Component puro, paso 6.3), mismo motivo que TicketActionsPanel:
// necesita estado local (useTransition por candidato) y handlers de click.
//
// UN <Alert> por candidato, no una lista adentro de uno solo -- el
// enunciado pide que "el banner de ESE candidato puntual desaparezca" al
// resolverlo, y cada uno tiene sus propios botones/su propio pending
// state independiente: dos candidatos nunca deberían bloquearse entre sí
// si un administrador resuelve uno mientras el otro sigue cargando.
//
// Oculta localmente el candidato resuelto ADEMÁS de llamar a
// router.refresh() -- no confía solo en la revalidación del servidor: la
// Server Action ya revalida las rutas de detalle de los DOS tickets del
// par (ver actions.ts), pero ocultarlo acá mismo, en el momento en que la
// respuesta vuelve `ok: true`, evita el parpadeo de esperar a que el
// round-trip de refresh() termine para que la fila resuelta deje de verse.
export function SimilarTicketBanner({
  candidates,
}: {
  candidates: PendingSimilarityCandidate[];
}) {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const visible = candidates.filter((c) => !hiddenIds.has(c.candidateId));

  if (visible.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      {visible.map((candidate) => (
        <SimilarTicketAlert
          key={candidate.candidateId}
          candidate={candidate}
          onResolved={() =>
            setHiddenIds((prev) => new Set(prev).add(candidate.candidateId))
          }
        />
      ))}
    </div>
  );
}

function SimilarTicketAlert({
  candidate,
  onResolved,
}: {
  candidate: PendingSimilarityCandidate;
  onResolved: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingResolution, setPendingResolution] =
    useState<SimilarityResolution | null>(null);

  function handleResolve(resolution: SimilarityResolution) {
    setPendingResolution(resolution);
    startTransition(async () => {
      const result = await resolveSimilarityCandidateAction({
        candidateId: candidate.candidateId,
        resolution,
      });
      setPendingResolution(null);
      if (result.ok) {
        toast.success(
          resolution === "grouped"
            ? "Marcado como duplicado."
            : "Descartado como duplicado.",
        );
        onResolved();
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  const otherHref = `/panel/tickets/${candidate.otherTicketId}`;
  const percent = Math.round(candidate.similarity * 100);

  return (
    <Alert>
      <Copy aria-hidden="true" />
      <AlertTitle>
        Posible duplicado de{" "}
        <Link href={otherHref} className="underline underline-offset-2">
          {candidate.otherPublicCode}
        </Link>
      </AlertTitle>
      <AlertDescription>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{percent}% de similitud</Badge>
        </div>
        <div className="mt-2 flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => handleResolve("grouped")}
          >
            {isPending && pendingResolution === "grouped"
              ? "Agrupando…"
              : "Agrupar"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => handleResolve("discarded")}
          >
            {isPending && pendingResolution === "discarded"
              ? "Descartando…"
              : "Descartar"}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
