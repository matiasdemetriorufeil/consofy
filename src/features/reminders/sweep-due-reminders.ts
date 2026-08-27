import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { reminders } from "@/db/schema";
import { insertNotification } from "@/features/notifications/create-notification";
import { buildReminderDueNotification } from "@/features/notifications/notification-content";
import { formatDateSlug } from "@/lib/format-date";

import { getReminderList } from "./queries";
import { REMINDER_ACTIVE_STATUSES } from "./reminder-schema";
import { getReminderUrgency } from "./reminder-urgency";

export type SweepDueRemindersResult =
  { ok: true; notifiedCount: number } | { ok: false; error: string };

// Barrido diario de recordatorios próximos a vencer/vencidos (paso 9.6,
// punto 1) -- lo único que faltaba conectar de
// `getReminderUrgency()`/`buildReminderDueNotification()` (paso 9.2/9.4):
// recorrer los recordatorios ACTIVOS de una organización y notificar los
// que ya entraron en la ventana de aviso (`upcoming`) o ya vencieron
// (`overdue`). `now`/`timezone` explícitos por parámetro (nunca resueltos
// acá adentro) -- el caller (run-daily-cron.ts) ya tiene la fila de la
// organización (id + timezone) resuelta para iterar todas las
// organizaciones activas; pedirle el timezone de nuevo acá sería una
// segunda consulta repitiendo la misma que el propio orquestador ya hizo.
//
// Idempotencia (punto 6) -- NO reusa el patrón "chequear notifications
// existentes" de ticket_overdue/incident_multi_unit: acá ya había un
// mecanismo mejor, pensado para esto exacto desde el paso 9.1.
// `reminders.status` tiene un valor `"notified"` que el propio comentario
// del índice en `src/db/schema/reminders.ts` describe así: *"Recordatorios
// que vencen en los próximos N días... WHERE status = 'pending' AND
// due_date <= (hoy + N) -- un barrido periódico"* -- es, literalmente,
// este barrido, señalado en el esquema desde tres pasos antes de que
// existiera. Compare-and-swap contra `status = 'pending'`
// (`UPDATE ... WHERE id = ? AND status = 'pending' RETURNING id`), MISMO
// criterio que `resolveIncidentAction` (paso 7.5) contra
// `incidents.status = 'open'`: si el UPDATE no toca ninguna fila (porque
// otra corrida del barrido ya lo pasó a "notified" mientras tanto, o
// porque alguien lo marcó "done"/"dismissed" desde el panel en el medio),
// no se inserta una segunda notificación -- la garantía es atómica, no un
// SELECT-y-después-INSERT con una ventana de carrera.
//
// UNA notificación por recordatorio en toda su vida como ocurrencia (no
// una por día que siga en la ventana) -- una vez `"notified"`, deja de
// calificar para este barrido (ya no es `"pending"`), pero SIGUE
// apareciendo día a día en el resumen diario (`sendDailySummaryEmail`,
// `REMINDER_ACTIVE_STATUSES` incluye `"pending"` Y `"notified"`) hasta que
// alguien lo marque `"done"`/`"dismissed"` -- el aviso puntual (campana +
// este barrido) es el empujón único; la visibilidad continua mientras
// sigue sin resolverse la da el resumen diario, no un segundo aviso
// puntual repetido. Señalado en el reporte del paso 9.6 como criterio
// propio, no una decisión de negocio ya tomada.
//
// REGLA DURA (punto 7): nunca propaga una excepción -- mismo patrón que
// sweepOverdueTickets/detectAndFlagSimilarTickets.
export async function sweepDueReminders(
  organizationId: string,
  timezone: string,
  now: Date = new Date(),
): Promise<SweepDueRemindersResult> {
  try {
    const todaySlug = formatDateSlug(now, timezone);

    const activeReminders = await getReminderList(
      organizationId,
      null,
      REMINDER_ACTIVE_STATUSES,
    );
    const pendingOnly = activeReminders.filter((r) => r.status === "pending");

    const qualifying = pendingOnly.filter((r) => {
      const urgency = getReminderUrgency(r.dueDate, r.noticeDays, todaySlug);
      return urgency !== "ok";
    });

    if (qualifying.length === 0) {
      return { ok: true, notifiedCount: 0 };
    }

    let notifiedCount = 0;
    for (const reminder of qualifying) {
      await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(reminders)
          .set({ status: "notified", lastNotifiedAt: now })
          .where(
            and(
              eq(reminders.id, reminder.id),
              eq(reminders.organizationId, organizationId),
              eq(reminders.status, "pending"),
            ),
          )
          .returning({ id: reminders.id });

        if (!updated) {
          // Otra corrida (o una acción manual del panel) ya lo movió de
          // "pending" -- el compare-and-swap ya hizo su trabajo, no hay
          // nada más que hacer con este recordatorio en esta pasada.
          return;
        }

        await insertNotification(tx, {
          organizationId,
          relatedReminderId: reminder.id,
          ...buildReminderDueNotification({
            buildingName: reminder.buildingName,
            reminderTitle: reminder.title,
            dueDate: reminder.dueDate,
            today: todaySlug,
          }),
        });
        notifiedCount += 1;
      });
    }

    return { ok: true, notifiedCount };
  } catch (error) {
    console.error(
      `[sweepDueReminders] Falló el barrido de recordatorios para la organización ${organizationId}:`,
      error,
    );
    return { ok: false, error: String(error) };
  }
}
