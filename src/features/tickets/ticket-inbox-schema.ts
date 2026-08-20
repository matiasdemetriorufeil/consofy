import { z } from "zod";

// Filtros del listado de reclamos (paso 6.1), parseados desde la URL --
// nunca desde un estado de React que se pierda al recargar o al compartir
// el link (ver el enunciado del paso: "los filtros se guardan en la URL").

// "open" (default) y "all" son estados propios de ESTE filtro, no valores
// de `ticket_status` en la base -- "open" resuelve a new+in_progress al
// armar la query (ver getStatusesForFilter en queries.ts), "all" resuelve
// a ningún filtro de estado. Los cinco restantes son el enum real.
export const TICKET_STATUS_FILTER_VALUES = [
  "open",
  "all",
  "new",
  "in_progress",
  "resolved",
  "closed",
  "discarded",
] as const;
export type TicketStatusFilterValue =
  (typeof TICKET_STATUS_FILTER_VALUES)[number];

export const TICKET_PRIORITY_FILTER_VALUES = [
  "low",
  "medium",
  "high",
  "urgent",
] as const;

// Sentinel para "sin asignar" en la URL -- un valor de texto que ningún
// nombre real de responsable va a coincidir con en la práctica (ver
// getAssigneeFilterOptions en queries.ts, que nunca devuelve este string
// como opción real).
export const UNASSIGNED_ASSIGNEE_VALUE = "__sin_asignar__";

const DATE_PARAM_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Paso 6.2 -- paginación y ordenamiento.

// 25, no un número redondo elegido al azar -- ver el reporte del paso para
// la cuenta completa, resumida acá: en el celular (el medio más
// restrictivo, ver CLAUDE.md > Bandeja de reclamos con filtros) una
// tarjeta mide ~114px con su espacio; un viewport típico deja ~550-600px
// visibles para tarjetas después del header/buscador/contador. Eso da
// ~5 tarjetas por "pantalla" de scroll -- 25 reclamos son unas 5 pantallas,
// una sesión de escaneo completa sin sentirse ni corta (repaginando todo
// el tiempo) ni larga (perdiendo de vista dónde está uno en la lista).
export const TICKET_INBOX_PAGE_SIZE = 25;

// Único par de columnas con un orden real y útil para triage (ver el
// reporte del paso para por qué se excluyeron código/edificio/unidad/
// categoría/estado/título): "reportedAt" (qué es más nuevo) y "priority"
// (qué es más urgente) -- las dos preguntas que un administrador
// realmente se hace al escanear la bandeja.
export const TICKET_SORT_COLUMNS = ["reportedAt", "priority"] as const;
export type TicketSortColumn = (typeof TICKET_SORT_COLUMNS)[number];

export const TICKET_SORT_DIRECTIONS = ["asc", "desc"] as const;
export type TicketSortDirection = (typeof TICKET_SORT_DIRECTIONS)[number];

// Búsqueda: mínimo 2 caracteres -- un solo caracter hace un ILIKE
// '%a%'-como casi sin poder de filtrado real (matchea casi cualquier fila)
// y desperdicia el índice trigram sin ganar nada. Se pisa a "" (tratado
// como ausente) en vez de rechazar el parseo entero: la URL puede traer un
// `q` corto de forma transitoria (el admin todavía está escribiendo) sin
// que la página rompa.
const searchSchema = z
  .string()
  .trim()
  .transform((value) => (value.length >= 2 ? value : ""));

export const ticketInboxSearchParamsSchema = z.object({
  building: z.uuid().optional(),
  unit: z.uuid().optional(),
  category: z.uuid().optional(),
  status: z.enum(TICKET_STATUS_FILTER_VALUES).optional().default("open"),
  priority: z.enum(TICKET_PRIORITY_FILTER_VALUES).optional(),
  assignee: z.string().min(1).optional(),
  from: z.string().regex(DATE_PARAM_REGEX).optional(),
  to: z.string().regex(DATE_PARAM_REGEX).optional(),
  q: searchSchema.optional(),
  // Sin escribir en la URL cuando vale 1 -- mismo criterio que "status=open"
  // en el paso 6.1: el default implícito no necesita aparecer, solo una
  // elección real del admin.
  page: z.coerce.number().int().positive().optional().default(1),
  // Default "reportedAt"/"desc" -- ver CLAUDE.md > Bandeja de reclamos con
  // filtros para por qué ese es el orden inicial (qué es más nuevo, la
  // misma pregunta que ya respondía el paso 6.1 antes de que existiera
  // ordenamiento explícito).
  sort: z.enum(TICKET_SORT_COLUMNS).optional().default("reportedAt"),
  dir: z.enum(TICKET_SORT_DIRECTIONS).optional().default("desc"),
});

export type TicketInboxSearchParams = z.infer<
  typeof ticketInboxSearchParamsSchema
>;

// Next entrega cada param como string | string[] | undefined -- normaliza
// tomando el primer valor si alguien pisa la URL a mano con el mismo
// nombre repetido (ej. ?status=open&status=all), antes de pasarle esto al
// schema de arriba.
export function normalizeSearchParams(
  raw: Record<string, string | string[] | undefined>,
): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw)) {
    result[key] = Array.isArray(value) ? value[0] : value;
  }
  return result;
}

// Si el ÚNICO filtro presente es el default implícito ("no eligió nada
// todavía"), sin ningún otro parámetro -- distingue la landing en blanco
// (posible empty state positivo, "sin reclamos abiertos") de una elección
// EXPLÍCITA del admin que también resulte en cero filas (empty state de
// "no encontramos resultados con estos filtros").
// Solo las claves que de verdad ESTRECHAN el resultado -- "page", "sort" y
// "dir" (paso 6.2) deliberadamente NO cuentan acá: cambiar de página u
// ordenar de otra forma no es un filtro, es otra vista del MISMO conjunto
// de resultados. Sin esta distinción, estar en la página 2 con cero
// resultados (no debería pasar -- se clampea el número de página, ver
// queries.ts -- pero por las dudas) mostraría el empty state de "no
// encontramos con estos filtros" en vez del positivo de "sin reclamos
// abiertos".
const FILTER_KEYS = [
  "building",
  "unit",
  "category",
  "status",
  "priority",
  "assignee",
  "from",
  "to",
  "q",
] as const;

export function hasExplicitFilters(
  params: Record<string, string | undefined>,
): boolean {
  const keys = FILTER_KEYS.filter((k) => params[k] !== undefined);
  if (keys.length === 0) {
    return false;
  }
  if (keys.length === 1 && keys[0] === "status" && params.status === "open") {
    return false;
  }
  return true;
}

// Arma un href de /panel/tickets partiendo de los searchParams actuales
// (ya normalizados) más una lista de cambios puntuales -- `null` borra esa
// clave, cualquier otro string la pisa. Usado server-side (paso 6.2) para
// los links de paginación y de encabezados ordenables: los dos son
// Server Components puros (Link de Next.js, sin onClick ni estado de
// cliente) porque construir el href siguiente no necesita saber nada que
// el servidor no supiera ya -- ver CLAUDE.md > Bandeja de reclamos con
// filtros sobre por qué esto no necesita ser un Client Component.
export function buildTicketInboxHref(
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

// Query string actual de la bandeja (paso 6.3), para volver desde el
// detalle de un reclamo sin perder los filtros/página/orden que traía el
// administrador -- ver el link "Volver a la bandeja" en
// /panel/tickets/[ticketId]/page.tsx. Se arma UNA vez en la lista
// (page.tsx) y viaja como el parámetro `from` de cada link a un reclamo
// (`?from=${encodeURIComponent(...)}`) -- el propio `from` nunca se valida
// como una URL completa (no lo es, ver el uso en el detalle: siempre se le
// antepone "/panel/tickets?" a mano), así que no hay superficie de open
// redirect que cuidar acá.
export function ticketInboxQueryString(
  currentParams: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(currentParams)) {
    if (value !== undefined) {
      params.set(key, value);
    }
  }
  return params.toString();
}

// Qué números de página mostrar en la paginación (paso 6.2) -- primera,
// última, la actual y una vecina de cada lado, con "…" para los huecos.
// Con pocas páginas (≤7) muestra todas, sin huecos -- el caso común dado
// el tamaño de página elegido (ver TICKET_INBOX_PAGE_SIZE): la mayoría de
// las búsquedas filtradas caen bajo un puñado de páginas.
export type TicketPageNumberEntry = number | "ellipsis";

export function getTicketPageNumbers(
  currentPage: number,
  totalPages: number,
): TicketPageNumberEntry[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const keep = new Set<number>(
    [1, totalPages, currentPage - 1, currentPage, currentPage + 1].filter(
      (p) => p >= 1 && p <= totalPages,
    ),
  );
  const sorted = [...keep].sort((a, b) => a - b);

  const result: TicketPageNumberEntry[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i]! - sorted[i - 1]! > 1) {
      result.push("ellipsis");
    }
    result.push(sorted[i]!);
  }
  return result;
}
