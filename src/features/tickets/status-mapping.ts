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
  // Bucket propio desde el paso 6.1: StatusBadge antes no lo tenía y esto
  // mapeaba a "cerrado" -- correcto mientras ninguna pantalla mostraba
  // reclamos descartados, pero el listado de reclamos (paso 6.1) sí los
  // filtra explícitamente, y un admin que elige "Descartado" en el filtro
  // no puede ver todas las filas decir "Cerrado".
  discarded: "descartado",
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
