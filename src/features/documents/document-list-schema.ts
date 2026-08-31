import { z } from "zod";

import { DOCUMENT_CATEGORIES } from "./document-schema";

// Filtros del explorador de documentos (paso 10.2), parseados desde la URL
// -- mismo criterio que `ticket-inbox-schema.ts` (paso 6.1/6.2): la URL es
// la fuente de verdad de "qué estoy mirando", nunca un estado de React que
// se pierda al recargar o compartir el link.
//
// El filtro de EDIFICIO no vive acá: es el selector del header (cookie,
// `getSelectedBuilding()`), reusado tal cual como en Recordatorios y
// Comunicados -- ver CLAUDE.md > Selector de edificio activo. Acá solo van
// los filtros propios de esta pantalla: categoría, búsqueda y página.

// 25 por página -- mismo tamaño que la bandeja de reclamos
// (`TICKET_INBOX_PAGE_SIZE`), el otro listado del panel con paginación
// numerada por URL. El número exacto importa menos que la regla del paso:
// paginación REAL, sin tope duro (ver CLAUDE.md > Centro de
// notificaciones, paso 9.3, sobre por qué un límite fijo sin forma de
// pedir más deja datos inaccesibles).
export const DOCUMENT_LIST_PAGE_SIZE = 25;

// Búsqueda: mínimo 2 caracteres -- igual que la bandeja de reclamos. Un
// solo caracter hace un ILIKE '%a%' casi sin poder de filtrado. Se pisa a
// "" (tratado como ausente) en vez de rechazar el parseo entero: la URL
// puede traer un `q` corto de forma transitoria mientras el admin escribe.
const searchSchema = z
  .string()
  .trim()
  .transform((value) => (value.length >= 2 ? value : ""));

export const documentListSearchParamsSchema = z.object({
  category: z.enum(DOCUMENT_CATEGORIES).optional(),
  q: searchSchema.optional(),
  // Sin escribir en la URL cuando vale 1 -- mismo criterio que la bandeja
  // de reclamos: el default implícito no necesita aparecer, solo una
  // elección real del admin.
  page: z.coerce.number().int().positive().optional().default(1),
});

export type DocumentListSearchParams = z.infer<
  typeof documentListSearchParamsSchema
>;

// Next entrega cada param como string | string[] | undefined -- toma el
// primer valor si alguien repite un nombre en la URL a mano, antes de
// pasárselo al schema. Copia deliberada de la de `ticket-inbox-schema.ts`
// (misma lógica, sin importar entre features).
export function normalizeSearchParams(
  raw: Record<string, string | string[] | undefined>,
): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw)) {
    result[key] = Array.isArray(value) ? value[0] : value;
  }
  return result;
}

// ¿Hay algún filtro EXPLÍCITO puesto por el admin? Distingue el empty state
// "no encontramos documentos con esos filtros" del de "todavía no se subió
// ningún documento". Se mira sobre los filtros YA PARSEADOS (no la URL
// cruda), así un `q` de 1 caracter -- que el schema ya pisó a "" -- no
// cuenta como filtro activo. `page` nunca cuenta: cambiar de página es
// otra vista del mismo conjunto, no un filtro (mismo criterio que
// `hasExplicitFilters` en la bandeja).
export function hasExplicitDocumentFilters(filters: {
  category?: string | undefined;
  q?: string | undefined;
}): boolean {
  return Boolean(filters.category) || Boolean(filters.q);
}

// Arma un href de /panel/documents partiendo de los searchParams actuales
// (ya normalizados) más overrides puntuales -- `null` borra la clave.
// Usado server-side para los links de paginación (Server Component puro,
// `<Link>` con el href ya resuelto -- el servidor ya sabe la página actual
// al renderizar). Copia de `buildTicketInboxHref`.
export function buildDocumentListHref(
  pathname: string,
  currentParams: Record<string, string | undefined>,
  overrides: Record<string, string | null>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(currentParams)) {
    if (value !== undefined) {
      params.set(key, value);
    }
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

// Qué números de página mostrar: primera, última, la actual y una vecina
// de cada lado, con "…" para los huecos. Con pocas páginas (≤7) las
// muestra todas -- el caso normal para el volumen de una biblioteca de
// edificio. Copia de `getTicketPageNumbers` (ticket-inbox-schema.ts):
// misma lógica, self-contained a propósito para no tocar el feature de
// reclamos en este paso (ver CLAUDE.md > Qué NO hacer -- "no refactors
// fuera del alcance del paso"). Si un tercer listado del panel necesita
// esto, ahí se justifica extraerlo a un módulo compartido.
export type DocumentPageEntry = number | "ellipsis";

export function getDocumentPageNumbers(
  currentPage: number,
  totalPages: number,
): DocumentPageEntry[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const keep = new Set<number>(
    [1, totalPages, currentPage - 1, currentPage, currentPage + 1].filter(
      (p) => p >= 1 && p <= totalPages,
    ),
  );
  const sorted = [...keep].sort((a, b) => a - b);

  const result: DocumentPageEntry[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i]! - sorted[i - 1]! > 1) {
      result.push("ellipsis");
    }
    result.push(sorted[i]!);
  }
  return result;
}
