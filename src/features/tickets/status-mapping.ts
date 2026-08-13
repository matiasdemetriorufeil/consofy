import type { tickets } from "@/db/schema";

import type { Priority } from "./components/priority-badge";
import type { TicketStatus } from "./components/status-badge";

type DbStatus = (typeof tickets.$inferSelect)["status"];
type DbPriority = (typeof tickets.$inferSelect)["priority"];

// StatusBadge/PriorityBadge (paso 1.3) se armaron con claves en español
// antes de que existiera el enum real de la base -- este archivo es el
// único lugar que traduce entre los dos, para no repetir el mapeo suelto
// en cada componente que necesite pintar un badge a partir de un reclamo
// real.
const STATUS_MAP: Record<DbStatus, TicketStatus> = {
  new: "abierto",
  in_progress: "en_progreso",
  resolved: "resuelto",
  closed: "cerrado",
  // StatusBadge todavía no tiene un bucket propio para "descartado" (solo
  // los 4 estados de arriba) -- se muestra como "cerrado", el más
  // parecido en significado (terminado, no pide acción), sin tocar el
  // componente compartido solo para este caso. Ninguna query del
  // dashboard (paso 3.5) devuelve reclamos descartados hoy, así que esto
  // no se ejercita todavía en la práctica -- queda correcto igual para
  // cuando se use en otra pantalla.
  discarded: "cerrado",
};

const PRIORITY_MAP: Record<DbPriority, Priority> = {
  urgent: "urgente",
  high: "alta",
  medium: "media",
  low: "baja",
};

export function toBadgeStatus(status: DbStatus): TicketStatus {
  return STATUS_MAP[status];
}

export function toBadgePriority(priority: DbPriority): Priority {
  return PRIORITY_MAP[priority];
}
