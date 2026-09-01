// Sin `import "server-only"` a propósito -- función pura, testeable en
// Vitest sin infraestructura de servidor (mismo criterio que
// normalize-ticket-text.ts, paso 7.1).

export function l2Norm(values: number[]): number {
  let sumSquares = 0;
  for (const v of values) {
    sumSquares += v * v;
  }
  return Math.sqrt(sumSquares);
}

// Normaliza a norma L2 unitaria. `gemini-embedding-001` con
// `outputDimensionality != 3072` devuelve vectores SIN normalizar (norma
// medida ~0.60 en la verificación del paso 14.2) -- y el índice HNSW del
// paso 14.1 usa `vector_cosine_ops`, que asume vectores de norma unitaria
// para que coseno y producto interno coincidan. Ver CLAUDE.md > Detección
// de duplicados por embeddings.
//
// Un vector de puros ceros (no debería salir de un texto real) se
// devuelve tal cual en vez de dividir por cero.
export function normalizeVector(values: number[]): number[] {
  const norm = l2Norm(values);
  if (norm === 0 || !Number.isFinite(norm)) {
    return values;
  }
  return values.map((v) => v / norm);
}
