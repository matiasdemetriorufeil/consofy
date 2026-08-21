import "server-only";

import { db } from "@/db";
import { ticketEvents, ticketSimilarityCandidates } from "@/db/schema";

import { findSimilarTickets } from "./find-similar-tickets";

// Umbral de similitud (paso 7.2): decisión tomada a partir de los números
// reales del paso 7.1 (los 6 pares del cluster del ascensor dieron entre
// 0.2073 y 0.3654; el único control negativo probado dio 0.1853) -- 0.20
// como default CONFIGURABLE, no un corte final. El paso 7.6 lo va a
// exponer editable desde el panel (probablemente por organización); hasta
// que exista esa pantalla, este constante es el único lugar que hay que
// tocar para ajustarlo.
export const DEFAULT_SIMILARITY_THRESHOLD = 0.2;

export type DetectSimilarTicketsInput = {
  organizationId: string;
  ticketId: string;
  buildingId: string;
  categoryId: string;
  title: string;
  description: string;
  reportedAt: Date;
};

export type DetectSimilarTicketsResult =
  { checked: true; flaggedCount: number } | { checked: false; error: unknown };

// Corre findSimilarTickets() sobre un ticket RECIÉN CREADO y persiste los
// candidatos que superan el umbral -- pensado para llamarse justo después
// del INSERT de tickets.ts en el alta pública (paso 5.5), nunca antes
// (necesita `ticketId` real para excluirse a sí mismo y para las FK de
// ticket_similarity_candidates/ticket_events).
//
// REGLA DURA del enunciado: esta función NUNCA propaga una excepción. Todo
// el cuerpo vive adentro de un try/catch que loguea y devuelve
// `{checked: false}` -- el alta del ticket (que ya se hizo, en una
// transacción aparte, ANTES de llamar a esto) no puede depender de que
// esto funcione. `findCandidates` es inyectable (default: la función real)
// solo para poder probar esta garantía con un mock que tira excepción, sin
// necesitar romper la base de verdad -- ver el reporte del paso.
export async function detectAndFlagSimilarTickets(
  input: DetectSimilarTicketsInput,
  options?: {
    threshold?: number;
    findCandidates?: typeof findSimilarTickets;
  },
): Promise<DetectSimilarTicketsResult> {
  const threshold = options?.threshold ?? DEFAULT_SIMILARITY_THRESHOLD;
  const findCandidates = options?.findCandidates ?? findSimilarTickets;

  try {
    const candidates = await findCandidates(input.organizationId, {
      buildingId: input.buildingId,
      categoryId: input.categoryId,
      title: input.title,
      description: input.description,
      excludeTicketId: input.ticketId,
      referenceReportedAt: input.reportedAt,
    });

    const flagged = candidates.filter((c) => c.similarity >= threshold);
    // Sin candidatos sobre el umbral: comportamiento silencioso, pedido
    // explícito del enunciado -- ni fila en ticket_similarity_candidates
    // ni evento en ticket_events. Un "0 duplicados encontrados" sería
    // ruido en la línea de tiempo de la enorme mayoría de los reclamos
    // (que NO son duplicados de nada).
    if (flagged.length === 0) {
      return { checked: true, flaggedCount: 0 };
    }

    // Las dos escrituras (marca + evento) sí van juntas en su propia
    // transacción -- no por la regla dura de arriba (que es sobre el
    // try/catch externo, no sobre esto), sino para que nunca quede una
    // marca en ticket_similarity_candidates sin su evento correspondiente
    // en la línea de tiempo, o viceversa.
    await db.transaction(async (tx) => {
      await tx.insert(ticketSimilarityCandidates).values(
        flagged.map((c) => ({
          organizationId: input.organizationId,
          ticketId: input.ticketId,
          candidateTicketId: c.id,
          similarity: c.similarity,
        })),
      );

      // Uno por candidato, no un evento resumen -- mismo criterio que
      // attachment_added (uno por archivo) y las acciones masivas del
      // paso 6.5 ("uno por reclamo actualizado, nunca un evento resumen").
      await tx.insert(ticketEvents).values(
        flagged.map((c) => ({
          organizationId: input.organizationId,
          ticketId: input.ticketId,
          type: "similar_ticket_detected" as const,
          actorType: "system" as const,
          actorLabel: "Sistema",
          payload: {
            candidateTicketId: c.id,
            candidatePublicCode: c.publicCode,
            similarity: c.similarity,
          },
        })),
      );
    });

    return { checked: true, flaggedCount: flagged.length };
  } catch (error) {
    // Logueado y absorbido acá -- nunca re-lanzado. Ver el comentario de
    // arriba de la función.
    console.error(
      `[detectAndFlagSimilarTickets] Falló la detección de posibles duplicados para el ticket ${input.ticketId}:`,
      error,
    );
    return { checked: false, error };
  }
}
