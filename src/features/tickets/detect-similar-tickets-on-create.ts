import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";
import { ticketEvents, ticketSimilarityCandidates } from "@/db/schema";

import { findSimilarTickets } from "./find-similar-tickets";
import { COMBINED_SIMILARITY_THRESHOLD } from "./hybrid-similarity";

// Paso 7.2 -> 14.4. Hasta el 14.3 esta función cortaba por el score de
// TRIGRAM contra el umbral POR EDIFICIO (`buildings.similarity_threshold`,
// paso 7.6). Desde el 14.4 corta por el SCORE COMBINADO (trigram + coseno
// reescalados y tomados por `max`, ver hybrid-similarity.ts) contra
// `COMBINED_SIMILARITY_THRESHOLD` (0.5 == al menos una de las dos métricas
// alcanzó su propio umbral). El umbral de trigram por edificio NO
// desaparece: se sigue usando, ahora adentro de `findSimilarTickets` para
// reescalar ese score antes de combinarlo. `DEFAULT_SIMILARITY_THRESHOLD`
// se re-exporta desde su módulo para no romper imports previos.
export { DEFAULT_SIMILARITY_THRESHOLD } from "./similarity-config";

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

// Lee el embedding YA GUARDADO del reclamo de referencia (columna
// `tickets.embedding`, paso 14.1 -- fuera del schema DSL de Drizzle, SQL
// crudo). En el camino en vivo del alta esto corre DESPUÉS de
// `embedAndStoreTicket` (ver public-form/actions.ts), así que normalmente
// ya está; si el embedding falló los 3 reintentos, devuelve `null` y la
// detección cae a trigram solo -- comportamiento esperado, no error.
async function loadTicketEmbedding(
  organizationId: string,
  ticketId: string,
): Promise<number[] | null> {
  const rows = await db.execute<{ embedding: string | null }>(sql`
    select "embedding"::text as embedding
    from "tickets"
    where "id" = ${ticketId}
      and "organization_id" = ${organizationId}
      and "deleted_at" is null
  `);
  const raw = rows[0]?.embedding;
  if (!raw) {
    return null;
  }
  // pgvector devuelve el vector como texto `[a,b,c]`.
  const parsed = JSON.parse(raw) as unknown;
  if (
    !Array.isArray(parsed) ||
    parsed.some((v) => typeof v !== "number" || !Number.isFinite(v))
  ) {
    return null;
  }
  return parsed as number[];
}

// Corre findSimilarTickets() sobre un ticket RECIÉN CREADO y persiste los
// candidatos cuyo SCORE COMBINADO supera el corte -- pensado para llamarse
// después del alta pública (paso 5.5), nunca antes (necesita `ticketId`
// real para excluirse a sí mismo y para las FK de
// ticket_similarity_candidates/ticket_events).
//
// REGLA DURA del enunciado (7.2, no cambia en el 14.4): esta función
// NUNCA propaga una excepción. Todo el cuerpo vive adentro de un try/catch
// que loguea y devuelve `{checked: false}` -- el alta del ticket (que ya
// se hizo, en una transacción aparte, ANTES de llamar a esto) no puede
// depender de que esto funcione. `findCandidates` y `loadReferenceEmbedding`
// son inyectables (default: las funciones reales) solo para poder probar
// esta garantía con un mock que tira excepción, sin romper la base.
export async function detectAndFlagSimilarTickets(
  input: DetectSimilarTicketsInput,
  options?: {
    combinedThreshold?: number;
    findCandidates?: typeof findSimilarTickets;
    loadReferenceEmbedding?: typeof loadTicketEmbedding;
  },
): Promise<DetectSimilarTicketsResult> {
  const findCandidates = options?.findCandidates ?? findSimilarTickets;
  const loadReferenceEmbedding =
    options?.loadReferenceEmbedding ?? loadTicketEmbedding;
  const combinedThreshold =
    options?.combinedThreshold ?? COMBINED_SIMILARITY_THRESHOLD;

  try {
    // Paso 14.4 -- el embedding del propio reclamo de referencia. Adentro
    // del try/catch: una falla acá (la base no responde, un vector
    // corrupto) cae en la MISMA regla dura de "nunca impedir el alta" que
    // protege al resto, no la escapa por estar "antes".
    const referenceEmbedding = await loadReferenceEmbedding(
      input.organizationId,
      input.ticketId,
    );

    const candidates = await findCandidates(input.organizationId, {
      buildingId: input.buildingId,
      categoryId: input.categoryId,
      title: input.title,
      description: input.description,
      excludeTicketId: input.ticketId,
      referenceReportedAt: input.reportedAt,
      referenceEmbedding: referenceEmbedding ?? undefined,
    });

    const flagged = candidates.filter(
      (c) => c.combinedScore >= combinedThreshold,
    );
    // Sin candidatos sobre el corte: comportamiento silencioso, pedido
    // explícito del enunciado (7.2) -- ni fila en
    // ticket_similarity_candidates ni evento en ticket_events. Un "0
    // duplicados encontrados" sería ruido en la línea de tiempo de la
    // enorme mayoría de los reclamos (que NO son duplicados de nada).
    if (flagged.length === 0) {
      return { checked: true, flaggedCount: 0 };
    }

    // Las dos escrituras (marca + evento) van juntas en su propia
    // transacción -- para que nunca quede una marca sin su evento
    // correspondiente en la línea de tiempo, o viceversa.
    await db.transaction(async (tx) => {
      await tx.insert(ticketSimilarityCandidates).values(
        flagged.map((c) => ({
          organizationId: input.organizationId,
          ticketId: input.ticketId,
          candidateTicketId: c.id,
          // El score que se persiste es el COMBINADO (14.4). La columna
          // `similarity` (CHECK 0..1) no cambia de tipo; cambia su
          // significado: antes trigram, ahora combinado.
          similarity: c.combinedScore,
        })),
      );

      // Uno por candidato, no un evento resumen -- mismo criterio que
      // attachment_added (uno por archivo) y las acciones masivas del
      // paso 6.5. El payload lleva ADEMÁS los dos scores crudos (trigram
      // y coseno) para poder auditar/calibrar en el 14.5 sin re-consultar.
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
            similarity: c.combinedScore,
            trigramSimilarity: c.trigramSimilarity,
            cosineSimilarity: c.cosineSimilarity,
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
