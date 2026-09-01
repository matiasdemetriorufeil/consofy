// Texto que se manda a la API de embeddings para un reclamo (paso 14.2).
//
// `{categoría}\n\n{descripción}` -- la categoría primero (contexto temático:
// "Ascensores", "Plomería", "Ruidos molestos"...) y después la descripción
// libre que escribió el vecino. Mismo insumo conceptual que
// `findSimilarTickets` (paso 7.1: título + descripción normalizados) pero
// con la CATEGORÍA en lugar del título derivado: el título de un reclamo
// del formulario público se deriva de los primeros ~80 caracteres de la
// descripción (`deriveTicketTitle`, paso 5.5), así que incluirlo sería
// casi duplicar el arranque de la descripción sin agregar señal. La
// categoría, en cambio, es una etiqueta corta y estable que ancla el tema.
//
// Sin normalización de acentos/mayúsculas acá (a diferencia de
// `normalizeTicketText` del 7.1): el modelo de embeddings entiende el
// texto natural, tal como está -- normalizarlo le sacaría matices que sí
// usa. Solo se recorta el espacio sobrante en los bordes.
export function composeTicketEmbeddingText(
  categoryName: string,
  description: string,
): string {
  return `${categoryName.trim()}\n\n${description.trim()}`.trim();
}
