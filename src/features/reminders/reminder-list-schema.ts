import { z } from "zod";

import { REMINDER_STATUSES } from "./reminder-schema";

// Filtro de estado de la bandeja (paso 9.1, punto 1). "active" (default,
// sin parámetro en la URL) = REMINDER_ACTIVE_STATUSES (pending + notified) --
// mismo criterio que "open" en ticket-inbox-schema.ts. "all" = sin filtro.
// Cualquier otro valor = exactamente ESE estado del enum.
export const REMINDER_STATUS_FILTER_VALUES = [
  "active",
  "all",
  ...REMINDER_STATUSES,
] as const;
export type ReminderStatusFilterValue =
  (typeof REMINDER_STATUS_FILTER_VALUES)[number];

// Vistas alternativas del paso 9.2, conviven con la lista del 9.1 -- ver
// CLAUDE.md > Vistas de calendario y próximos vencimientos para por qué es
// un `?view=` de la MISMA ruta (`/panel/reminders`) y no tres rutas
// separadas como `BuildingDetailTabs`. "list" es el default -- la pantalla
// que ya existía antes de este paso sigue siendo la de entrada.
export const REMINDER_VIEWS = ["list", "upcoming", "calendar"] as const;
export type ReminderView = (typeof REMINDER_VIEWS)[number];

export const reminderListSearchParamsSchema = z.object({
  status: z.enum(REMINDER_STATUS_FILTER_VALUES).default("active"),
  view: z.enum(REMINDER_VIEWS).default("list"),
});

// Sin escribir `status`/`view` en la URL cuando coinciden con el default --
// mismo patrón que buildTicketInboxHref/"status=open" (CLAUDE.md >
// Paginación y orden, paso 6.2): la pantalla nunca miente sobre qué está
// mostrando (los controles igual quedan preseleccionados), pero la URL se
// queda limpia en el caso más común.
export function buildReminderListHref(
  status: ReminderStatusFilterValue,
): string {
  return status === "active"
    ? "/panel/reminders"
    : `/panel/reminders?status=${status}`;
}

// `status` no viaja acá a propósito: es un filtro propio de la vista
// "list" (chips de estado, paso 9.1) sin equivalente en "upcoming"
// (siempre son los recordatorios ACTIVOS, ver CLAUDE.md) ni en "calendar"
// (siempre son TODOS los estados) -- cambiar de vista nunca debería
// arrastrar un filtro que la vista de destino ni siquiera ofrece.
export function buildReminderViewHref(view: ReminderView): string {
  return view === "list" ? "/panel/reminders" : `/panel/reminders?view=${view}`;
}
