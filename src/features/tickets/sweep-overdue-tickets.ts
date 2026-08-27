import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { notifications } from "@/db/schema";
import { insertNotification } from "@/features/notifications/create-notification";
import {
  buildTicketOverdueNotification,
  ticketQualifiesAsOverdue,
} from "@/features/notifications/notification-content";

import { getOpenTickets } from "./queries";

export type SweepOverdueTicketsResult =
  { ok: true; notifiedCount: number } | { ok: false; error: string };

// Barrido diario de reclamos vencidos (paso 9.6, punto 2) -- lo único que
// faltaba conectar de `ticketQualifiesAsOverdue()`/
// `buildTicketOverdueNotification()` (paso 9.4, corrección): recorrer los
// reclamos abiertos de una organización y notificar los que califiquen.
// `now` explícito por parámetro (nunca `new Date()` interno más abajo) --
// mismo motivo que `ticketQualifiesAsOverdue` recibe `now`: un solo
// instante consistente para TODOS los reclamos de esta corrida, no uno
// distinto por cada `await` que pase mientras el barrido corre.
//
// Idempotencia (punto 6) -- reusa el MISMO mecanismo ya aceptado en la
// corrección del 9.4 para `incident_multi_unit`
// (`maybeNotifyMultiUnitIncident`, group-tickets-into-incident.ts): antes
// de insertar, se chequea qué reclamos de los que califican YA tienen una
// notificación `type: "ticket_overdue"` -- esos se saltean. A diferencia
// de esa función (un chequeo por incidente, llamada una vez por
// resolución), acá se resuelve en UNA sola consulta batched para toda la
// organización (`relatedTicketId IN (...)`), no una consulta por reclamo
// -- con potencialmente decenas de reclamos abiertos por corrida, un
// chequeo N+1 sería el mismo patrón pero multiplicado por N sin
// necesidad.
//
// Un reclamo vencido recibe la notificación UNA sola vez en toda su vida
// (no una vez por día que siga sin resolverse) -- mismo criterio de fondo
// que `reminders.status` pasa a "notified" y deja de re-notificarse
// (sweep-due-reminders.ts): un aviso repetido todos los días sobre el
// MISMO reclamo sin resolver es ruido, no señal; el resumen diario
// (`sendDailySummaryEmail`, paso 9.5) ya lo mantiene visible día a día de
// todos modos ("Reclamos urgentes sin resolver" cubre a los urgentes, no
// a estos -- ver la nota en el reporte del paso 9.6 sobre esta asimetría,
// señalada, no resuelta acá).
//
// REGLA DURA (punto 7, mismo patrón que detectAndFlagSimilarTickets):
// nunca propaga una excepción -- todo el cuerpo vive en un try/catch que
// loguea y devuelve `{ok: false}`, para que el orquestador del cron
// (run-daily-cron.ts) pueda seguir con las otras tareas sin importar qué
// pase acá.
export async function sweepOverdueTickets(
  organizationId: string,
  now: Date = new Date(),
): Promise<SweepOverdueTicketsResult> {
  try {
    const openTickets = await getOpenTickets(organizationId);
    const qualifying = openTickets.filter((t) =>
      ticketQualifiesAsOverdue(t, now),
    );

    if (qualifying.length === 0) {
      return { ok: true, notifiedCount: 0 };
    }

    const qualifyingIds = qualifying.map((t) => t.id);
    const alreadyNotifiedRows = await db
      .select({ ticketId: notifications.relatedTicketId })
      .from(notifications)
      .where(
        and(
          eq(notifications.type, "ticket_overdue"),
          inArray(notifications.relatedTicketId, qualifyingIds),
        ),
      );
    const alreadyNotified = new Set(alreadyNotifiedRows.map((r) => r.ticketId));

    const toNotify = qualifying.filter((t) => !alreadyNotified.has(t.id));
    if (toNotify.length === 0) {
      return { ok: true, notifiedCount: 0 };
    }

    for (const ticket of toNotify) {
      await insertNotification(db, {
        organizationId,
        relatedTicketId: ticket.id,
        ...buildTicketOverdueNotification({
          ticketId: ticket.id,
          buildingName: ticket.buildingName,
          ticketTitle: ticket.title,
        }),
      });
    }

    return { ok: true, notifiedCount: toNotify.length };
  } catch (error) {
    console.error(
      `[sweepOverdueTickets] Falló el barrido de reclamos vencidos para la organización ${organizationId}:`,
      error,
    );
    return { ok: false, error: String(error) };
  }
}
