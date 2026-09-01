import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";

import { composeTicketEmbeddingText } from "./compose-embedding-text";
import {
  EMBEDDING_DIMENSIONS,
  fetchGeminiEmbedding,
  GeminiEmbeddingError,
} from "./gemini-embedding";

export type EmbedTicketInput = {
  ticketId: string;
  organizationId: string;
  categoryName: string;
  description: string;
};

export type EmbedTicketResult =
  { ok: true; stored: boolean } | { ok: false; error: unknown };

// Reintentos del CAMINO EN VIVO (paso 14.2, frente 4): 3 intentos, backoff
// exponencial ~1s / ~2s / ~4s con jitter. Solo se reintenta un error
// TRANSITORIO (429 / 5xx / timeout -- ver GeminiEmbeddingError.transient).
// Agotados los 3, se deja `tickets.embedding` en NULL y lo levanta el
// barrido diario (sweep-missing-embeddings.ts). Números chicos a
// propósito: el camino en vivo (dentro de `after()`, ver el call site en
// public-form/actions.ts) no debe acumular trabajo de fondo largo -- los
// reintentos "con paciencia" son responsabilidad del barrido, que corre
// una vez por día sin apuro.
const LIVE_MAX_ATTEMPTS = 3;
const LIVE_BASE_DELAY_MS = 1_000;

function delayForAttempt(attempt: number): number {
  // attempt: 1 -> ~1s, 2 -> ~2s, 3 -> ~4s (no se usa después del último).
  const base = LIVE_BASE_DELAY_MS * 2 ** (attempt - 1);
  // Jitter +-25%: si varias altas fallan a la vez (ej. un 429 corto), que
  // no reintenten todas exactamente en el mismo instante.
  const jitter = base * (Math.random() * 0.5 - 0.25);
  return Math.round(base + jitter);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Genera el embedding de UN reclamo y lo guarda en `tickets.embedding`.
//
// REGLA DURA (mismo patrón que `detectAndFlagSimilarTickets`, paso 7.2, y
// que los barridos del cron del 9.6): NUNCA propaga una excepción. Todo el
// cuerpo vive en un try/catch que loguea y devuelve `{ok: false}`. El alta
// del reclamo ya se completó (esto se dispara con `after()`, después de la
// respuesta al vecino), y el barrido diario es la red de seguridad -- un
// fallo acá no puede romper nada.
//
// Idempotente: el UPDATE lleva `embedding IS NULL` en el WHERE, así que si
// el camino en vivo y una corrida del barrido procesan el mismo reclamo
// casi a la vez, el segundo no pisa nada (y `stored: false` lo refleja).
export async function embedAndStoreTicket(
  input: EmbedTicketInput,
  options?: { findEmbedding?: typeof fetchGeminiEmbedding },
): Promise<EmbedTicketResult> {
  const findEmbedding = options?.findEmbedding ?? fetchGeminiEmbedding;

  try {
    const text = composeTicketEmbeddingText(
      input.categoryName,
      input.description,
    );

    let vector: number[] | null = null;
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= LIVE_MAX_ATTEMPTS; attempt++) {
      try {
        vector = await findEmbedding(text);
        break;
      } catch (error) {
        lastError = error;
        const transient =
          error instanceof GeminiEmbeddingError ? error.transient : true;
        if (!transient || attempt === LIVE_MAX_ATTEMPTS) {
          throw error;
        }
        await sleep(delayForAttempt(attempt));
      }
    }

    if (!vector) {
      // Solo se llega acá si el loop terminó sin `break` y sin `throw` --
      // no debería pasar, pero por las dudas no escribimos un NULL/nada.
      throw lastError ?? new Error("Embedding vacío tras los reintentos.");
    }

    // `tickets.embedding` no está en el schema DSL de Drizzle (decisión del
    // 14.1: objeto no gestionado, igual que los índices GIN de trigram) --
    // se escribe con SQL crudo. pgvector acepta el formato de texto
    // `[a,b,c]` casteado a `vector`; `JSON.stringify` de un array de
    // números produce exactamente eso.
    const literal = `[${vector.join(",")}]`;
    const updated = await db.execute<{ id: string }>(sql`
      update "tickets"
      set "embedding" = ${literal}::vector(${sql.raw(String(EMBEDDING_DIMENSIONS))})
      where "id" = ${input.ticketId}
        and "organization_id" = ${input.organizationId}
        and "deleted_at" is null
        and "embedding" is null
      returning "id"
    `);

    return { ok: true, stored: updated.length > 0 };
  } catch (error) {
    console.error(
      `[embedAndStoreTicket] No se pudo generar/guardar el embedding del reclamo ${input.ticketId}:`,
      error,
    );
    return { ok: false, error };
  }
}
