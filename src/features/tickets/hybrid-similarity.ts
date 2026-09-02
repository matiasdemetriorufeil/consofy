// Búsqueda híbrida (paso 14.4): combina la similitud LÉXICA (pg_trgm,
// `similarity()`, paso 7.1) con la similitud SEMÁNTICA (coseno entre
// embeddings, columna `tickets.embedding`, índice HNSW, pasos 14.1-14.3)
// en un único score combinado.
//
// Módulo PURO, sin `import "server-only"` -- misma razón que
// `normalize-ticket-text.ts` / `vector-math.ts`: la lógica de combinación
// es aritmética testeable en aislamiento, sin base ni red.
//
// El insight que ordena todo este archivo: las dos métricas viven en
// ESCALAS DISTINTAS y no se pueden promediar ni comparar crudas.
//   - trigram: `similarity()` de pg_trgm. "Parecido" arranca en ~0.20
//     (el `DEFAULT_SIMILARITY_THRESHOLD` del paso 7.2, calibrado con los
//     pares reales del cluster del ascensor: 0.2073 a 0.3654).
//   - coseno: entre embeddings `gemini-embedding-001` normalizados a
//     norma unitaria. El piso de ruido es alto -- dos reclamos SIN
//     relación de la misma categoría rondan 0.55-0.70; una reformulación
//     genuina, 0.80-0.92 (medido en la verificación del paso 14.4).
// Un umbral crudo único es incoherente: 0.20 sobre coseno marca
// cualquier cosa, 0.78 sobre trigram no marca nada. La solución es
// reescalar cada métrica contra SU PROPIO umbral a una escala común.

// Umbral de similitud de COSENO -- la "barra" semántica. PUNTO DE PARTIDA,
// no un valor calibrado con volumen real: se ajusta en el paso 14.5 (la
// pantalla de calibración con datos reales). 0.78 cae en el hueco medido
// entre el piso de ruido (~0.70) y las reformulaciones genuinas (~0.80+),
// tirando a conservador (menos falsos positivos) porque un falso negativo
// acá lo tapa igual el trigram si el texto es lo bastante parecido.
export const DEFAULT_COSINE_SIMILARITY_THRESHOLD = 0.78;

// Corte del SCORE COMBINADO. Por construcción de `rescaleSimilarity`, 0.5
// es exactamente "al menos una de las dos métricas alcanzó su propio
// umbral". Subirlo (ej. 0.6) pasaría a exigir SUPERAR el umbral, no solo
// alcanzarlo. PUNTO DE PARTIDA para el 14.5 -- igual que arriba.
export const COMBINED_SIMILARITY_THRESHOLD = 0.5;

// Cuántos vecinos más cercanos por embedding trae la consulta vectorial
// (el `LIMIT` del `ORDER BY embedding <=> ref`, ver find-similar-tickets.ts).
// El conjunto en alcance (mismo edificio + categoría + estado abierto +
// ventana) casi siempre tiene < 20 reclamos (ver las mediciones del paso
// 7.1). El límite solo "muerde" en una ráfaga patológica, y ahí se queda
// con los 20 semánticamente más cercanos -- que es lo correcto. Además es
// lo que le da a la consulta la forma `ORDER BY ... LIMIT k` que el
// índice HNSW sabe resolver.
export const VECTOR_CANDIDATE_LIMIT = 20;

// Reescala una métrica en [0, 1] con umbral `threshold` a una escala común
// en [0, 1] donde el umbral SIEMPRE cae en 0.5:
//   [0, threshold]  -> [0, 0.5]   (lineal)
//   [threshold, 1]  -> [0.5, 1]   (lineal)
// Así dos métricas cuyos umbrales crudos viven en escalas distintas
// (trigram ~0.20, coseno ~0.78) se pueden comparar y combinar sin que una
// aplaste a la otra.
export function rescaleSimilarity(value: number, threshold: number): number {
  const x = Math.min(1, Math.max(0, value));
  // Umbral fuera de (0, 1) no tiene sentido; se acota para no dividir por
  // cero ni por un negativo si un caller pasa basura.
  const t = Math.min(1 - 1e-9, Math.max(1e-9, threshold));
  if (x <= t) {
    return 0.5 * (x / t);
  }
  return 0.5 + 0.5 * ((x - t) / (1 - t));
}

export type CombineSimilarityInput = {
  trigramSimilarity: number;
  // `null` = el candidato no tiene embedding (reclamo histórico sin
  // backfillear -- el arquitecto decidió NO backfillear en el 14.4 --, o
  // un alta cuyo embedding todavía no se calculó o falló los 3 reintentos).
  // Ese par cae a comparación SOLO por trigram. Comportamiento esperado,
  // no error.
  cosineSimilarity: number | null;
  // Umbral de trigram: POR EDIFICIO (`buildings.similarity_threshold`,
  // paso 7.6). Se pasa explícito para que el reescalado use la barra real
  // configurada por ese administrador.
  trigramThreshold: number;
  cosineThreshold?: number;
};

// Score combinado = MAX de las dos métricas reescaladas.
//
// `max` y no promedio (ni promedio ponderado) a propósito: el vector
// COMPLEMENTA al trigram, nunca lo tapa. Un par que el trigram ya
// marcaría (trigram >= su umbral => reescalado >= 0.5) sigue marcándose
// aunque el coseno sea bajo o NULL -- 14.4 no puede hacer REGRESAR nada
// que la etapa 7 ya detectaba. Y al revés: un par léxicamente flojo
// (trigram 0.08) pero semánticamente fuerte (coseno 0.85 > 0.78 =>
// reescalado > 0.5) ahora SÍ se marca, que es exactamente la capa que a
// los trigramas se les escapa ("el ascensor no anda" vs "hace tres días
// que no puedo bajar en el elevador").
//
// Se consideraron promedio simple, promedio ponderado y "vector solo como
// desempate"; ver CLAUDE.md > Búsqueda híbrida para por qué `max` de
// reescalados es el punto de partida y qué calibra el 14.5.
export function combineSimilarityScores(input: CombineSimilarityInput): number {
  const lexical = rescaleSimilarity(
    input.trigramSimilarity,
    input.trigramThreshold,
  );
  const semantic =
    input.cosineSimilarity === null
      ? 0
      : rescaleSimilarity(
          input.cosineSimilarity,
          input.cosineThreshold ?? DEFAULT_COSINE_SIMILARITY_THRESHOLD,
        );
  return Math.max(lexical, semantic);
}
