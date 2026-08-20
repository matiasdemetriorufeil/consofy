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
export function hasExplicitFilters(
  params: Record<string, string | undefined>,
): boolean {
  const keys = Object.keys(params).filter((k) => params[k] !== undefined);
  if (keys.length === 0) {
    return false;
  }
  if (keys.length === 1 && keys[0] === "status" && params.status === "open") {
    return false;
  }
  return true;
}
