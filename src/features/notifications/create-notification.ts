import "server-only";

import { db } from "@/db";
import { notifications } from "@/db/schema";

import type { NotificationContent } from "./notification-content";

// Acepta `db` suelto o una transacción abierta -- mismo patrón que
// DbTransaction en group-tickets-into-incident.ts (paso 7.4). new_ticket
// (createTicketAction, public-form/actions.ts) inserta la notificación
// DENTRO de la misma transacción que crea el reclamo, así que necesita
// `tx`: si esa transacción hace rollback (ej. la carrera de teléfono, ver
// isPhoneRaceError), la notificación tiene que desaparecer con ella, no
// quedar huérfana apuntando a un ticket que nunca existió. incident_updated
// (resolveIncidentAction, incidents/actions.ts) no corre dentro de una
// transacción propia -- ahí alcanza con `db` (ver el comentario de
// idempotencia en esa acción: el compare-and-swap contra status='open' ya
// garantiza que esta función se llama como mucho una vez por resolución
// real).
type DbOrTransaction =
  typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type NewNotificationInput = NotificationContent & {
  organizationId: string;
  relatedTicketId?: string;
  relatedReminderId?: string;
  relatedIncidentId?: string;
};

export async function insertNotification(
  client: DbOrTransaction,
  input: NewNotificationInput,
): Promise<void> {
  await client.insert(notifications).values(input);
}
