// Normalización de texto para comparar reclamos (paso 7.1) -- minúsculas,
// sin tildes, espacios colapsados (pedido explícito del paso), NADA más
// (no saca puntuación: no se pidió, y los trigramas de pg_trgm ya toleran
// razonablemente bien comas/puntos distintos entre dos redacciones del
// mismo problema).
//
// Archivo APARTE, sin `import "server-only"` -- a diferencia de
// find-similar-tickets.ts (que sí lo tiene, porque toca la base), esta es
// la mitad puramente de texto, sin ninguna dependencia de DB/entorno. Se
// separó de find-similar-tickets.ts al descubrir, probando este mismo
// paso, que un solo `import "server-only"` al principio de un archivo
// taint-ea TODO lo que ese archivo exporta -- incluidas funciones puras
// que no tocan la base -- y Vitest (sin la condición `react-server` que sí
// define Next.js al bundlear) hace que ese import explote apenas se
// importa el archivo en un test. Mismo criterio ya usado en el proyecto
// para `formatTicketMessage` (paso 5.6): la lógica de texto pura vive en
// su propio módulo, testeable sin infraestructura de servidor/DB.
//
// Implementada a mano (lower + reemplazo de vocales acentuadas + ñ/ü, sin
// la extensión `unaccent` de Postgres): `unaccent` NO está instalada en la
// base (verificado contra `pg_extension` antes de escribir esto, mismo
// criterio que exige CLAUDE.md > Acceso a datos para pg_trgm -- no
// asumir), y agregar una extensión nueva sin avisar está prohibido (ver
// CLAUDE.md > Convenciones). Para español rioplatense alcanza con mapear
// las siete letras acentuadas reales -- no hace falta unaccent para este
// alfabeto.
//
// Exportadas junto con la función: find-similar-tickets.ts arma el
// equivalente en SQL (regexp_replace + translate) reusando ESTAS MISMAS
// constantes, para que las dos implementaciones (JS del lado de la
// referencia, SQL del lado de cada candidato) apliquen exactamente el
// mismo mapeo -- nunca dos copias que se puedan desincronizar.
export const ACCENTED_CHARS = "áéíóúñü";
export const PLAIN_CHARS = "aeiounu";

export function normalizeTicketText(text: string): string {
  let result = "";
  for (const ch of text.toLowerCase()) {
    const idx = ACCENTED_CHARS.indexOf(ch);
    result += idx === -1 ? ch : PLAIN_CHARS[idx]!;
  }
  return result.trim().replace(/\s+/g, " ");
}
