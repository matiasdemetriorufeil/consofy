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

export const reminderListSearchParamsSchema = z.object({
  status: z.enum(REMINDER_STATUS_FILTER_VALUES).default("active"),
});

// Sin escribir `status` en la URL cuando coincide con el default -- mismo
// patrón que buildTicketInboxHref/"status=open" (CLAUDE.md > Paginación y
// orden, paso 6.2): la pantalla nunca miente sobre qué está filtrando (el
// <select> igual lo muestra preseleccionado), pero la URL se queda limpia
// en el caso más común.
export function buildReminderListHref(
  status: ReminderStatusFilterValue,
): string {
  return status === "active"
    ? "/panel/reminders"
    : `/panel/reminders?status=${status}`;
}
