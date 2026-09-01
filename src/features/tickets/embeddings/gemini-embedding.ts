import "server-only";

import { env } from "@/lib/env";

import { normalizeVector } from "./vector-math";

// Cliente de la API de embeddings de Gemini (paso 14.2).
//
// Modelo y dimensión: fijados en el paso 14.1 (ver CLAUDE.md > Detección
// de duplicados por embeddings). `gemini-embedding-001`,
// `outputDimensionality: 768`.
//
// Shape del request CONFIRMADO contra la API real (no de memoria), no
// contra el SDK -- este proyecto no usa el `@google/genai` SDK, es un
// `fetch` directo, misma decisión que Resend/Supabase Storage (un cliente
// mínimo, sin dependencia nueva). La llamada de verificación devolvió:
//   POST https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent
//   headers: { "x-goog-api-key": <GEMINI_API_KEY>, "content-type": "application/json" }
//   body: { model: "models/gemini-embedding-001",
//           content: { parts: [{ text }] },
//           outputDimensionality: 768 }
//   -> 200 { embedding: { values: number[768] } }
//   El vector devuelto NO viene normalizado (norma L2 medida ~0.60, no
//   1.0) -- con este modelo hay que normalizar del lado de la app cuando
//   la dimensión != 3072 (documentado en el 14.1). Se hace acá abajo.
export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIMENSIONS = 768;

const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent`;

// La API responde rápido (la verificación dio ~800ms desde esta red), pero
// un timeout acotado evita que un cuelgue de red deje una llamada colgada
// consumiendo el presupuesto de tiempo del `after()` o de una corrida del
// cron. 15s es holgado para el p99 y corto frente a lo que tardaría un
// AbortController que nunca dispara.
const REQUEST_TIMEOUT_MS = 15_000;

// Error tipado para que el wrapper de reintentos (embed-ticket.ts) pueda
// distinguir un fallo TRANSITORIO (429 / 5xx / timeout de red) -- que sí
// vale la pena reintentar con backoff -- de uno permanente (400 por texto
// inválido, 401/403 por key mala) que reintentar no arregla.
export class GeminiEmbeddingError extends Error {
  readonly status: number | null;
  readonly transient: boolean;

  constructor(
    message: string,
    opts: { status?: number | null; transient: boolean; cause?: unknown },
  ) {
    super(
      message,
      opts.cause !== undefined ? { cause: opts.cause } : undefined,
    );
    this.name = "GeminiEmbeddingError";
    this.status = opts.status ?? null;
    this.transient = opts.transient;
  }
}

// Una sola llamada a la API (sin reintentos -- eso lo maneja el caller, ver
// embed-ticket.ts). Devuelve el vector YA NORMALIZADO de 768 dimensiones.
// Tira `GeminiEmbeddingError` en cualquier fallo, con `transient` marcado
// según corresponda.
export async function fetchGeminiEmbedding(text: string): Promise<number[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        model: `models/${EMBEDDING_MODEL}`,
        content: { parts: [{ text }] },
        outputDimensionality: EMBEDDING_DIMENSIONS,
      }),
      signal: controller.signal,
    });
  } catch (cause) {
    // AbortError (timeout) o error de red (DNS, ECONNRESET...) -- todos
    // transitorios: la próxima vez puede andar.
    throw new GeminiEmbeddingError(
      `No se pudo contactar la API de embeddings de Gemini: ${String(cause)}`,
      { transient: true, cause },
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    // 429 (rate limit) y 5xx son transitorios; 4xx (400/401/403) no lo son
    // -- reintentar un texto inválido o una key mala solo gasta cuota.
    const transient = response.status === 429 || response.status >= 500;
    let bodyText = "";
    try {
      bodyText = (await response.text()).slice(0, 500);
    } catch {
      // no pasa nada, el status ya alcanza
    }
    throw new GeminiEmbeddingError(
      `API de embeddings devolvió ${response.status} ${response.statusText}. ${bodyText}`,
      { status: response.status, transient },
    );
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (cause) {
    throw new GeminiEmbeddingError(
      "Respuesta de embeddings no es JSON válido.",
      {
        transient: true,
        cause,
      },
    );
  }

  const values = (json as { embedding?: { values?: unknown } })?.embedding
    ?.values;
  if (
    !Array.isArray(values) ||
    values.length !== EMBEDDING_DIMENSIONS ||
    !values.every((v) => typeof v === "number" && Number.isFinite(v))
  ) {
    throw new GeminiEmbeddingError(
      `Respuesta de embeddings con forma inesperada (se esperaban ${EMBEDDING_DIMENSIONS} números en embedding.values).`,
      { transient: false },
    );
  }

  return normalizeVector(values as number[]);
}
