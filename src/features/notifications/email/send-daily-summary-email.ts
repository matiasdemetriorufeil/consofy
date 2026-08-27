import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { organizations } from "@/db/schema";
import { getReminderList } from "@/features/reminders/queries";
import { REMINDER_ACTIVE_STATUSES } from "@/features/reminders/reminder-schema";
import { getReminderUrgency } from "@/features/reminders/reminder-urgency";
import {
  getAttentionTickets,
  getTicketsReportedInRange,
} from "@/features/tickets/queries";
import { env } from "@/lib/env";
import { formatDateSlug, zonedDayBoundsToUtc } from "@/lib/format-date";

import {
  buildDailySummaryEmail,
  type DailySummaryReminderRow,
  type DailySummaryTicketRow,
} from "../email-content";
import { getAdminEmails } from "./get-admin-emails";
import { getEmailProvider } from "./get-email-provider";

// Fecha larga en español, SOLO fecha (sin hora, a diferencia de
// formatExactDate en lib/format-date.ts, pensada para timestamps
// puntuales) -- para el subject/encabezado del resumen ("27 de agosto de
// 2026"). Un solo consumidor hoy (este archivo): se extrae a
// lib/format-date.ts recién si aparece un segundo, mismo criterio ya
// aplicado en el proyecto (ver el comentario de formatDueDate,
// reminders/format-due-date.ts).
function formatLongDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: timezone,
    dateStyle: "long",
  }).format(date);
}

// Resumen diario (paso 9.5, punto 5) -- función NO conectada a ningún
// disparador automático todavía (pedido explícito del enunciado): el
// disparo diario es el cron del paso 9.6, mismo patrón que quedó
// pendiente con ticket_overdue/reminder_due en la corrección del 9.4 (ver
// CLAUDE.md > Generación automática de notificaciones, "Qué falta para
// que se disparen solos"). Esta función hace TODO lo que hace falta para
// mandar el resumen de UNA organización -- 9.6 la llama una vez por
// organización activa, no tiene que armar nada más.
//
// Qué junta, y por qué (criterio propio, señalado en el reporte del
// paso):
// - Reclamos nuevos del día: getTicketsReportedInRange con los límites de
//   "hoy" en la zona horaria de la organización (zonedDayBoundsToUtc,
//   nunca UTC ni la del servidor que corre el cron).
// - Reclamos urgentes sin resolver: reusa getAttentionTickets()
//   (dashboard, paso 3.5) filtrando por priority === "urgent" -- esa
//   consulta ya trae "urgente O estancado, siempre abierto"; filtrar acá
//   da exactamente "urgente Y abierto" sin escribir una consulta nueva
//   que duplique la misma lógica. NO se limita a los de HOY -- un
//   urgente de ayer sin atender sigue siendo lo más importante que este
//   email puede decir.
// - Recordatorios que necesitan atención: reusa getReminderList() +
//   getReminderUrgency() (paso 9.2, el mismo semáforo de vencimientos),
//   overdue Y upcoming -- ver el comentario de email-content.ts sobre
//   por qué no se limita a "upcoming" literal.
//
// REGLA DURA (punto 7): nunca propaga una excepción -- mismo criterio que
// sendUrgentTicketAlertEmail/detectAndFlagSimilarTickets.
export async function sendDailySummaryEmail(
  organizationId: string,
): Promise<void> {
  try {
    const [org] = await db
      .select({ name: organizations.name, timezone: organizations.timezone })
      .from(organizations)
      .where(eq(organizations.id, organizationId));
    if (!org) {
      console.error(
        `[sendDailySummaryEmail] No se encontró la organización ${organizationId}.`,
      );
      return;
    }

    const adminEmails = await getAdminEmails(organizationId);
    if (adminEmails.length === 0) {
      return;
    }

    const now = new Date();
    const todaySlug = formatDateSlug(now, org.timezone);
    const { start, end } = zonedDayBoundsToUtc(todaySlug, org.timezone);

    const [reportedToday, attentionTickets, reminders] = await Promise.all([
      getTicketsReportedInRange(organizationId, start, end),
      getAttentionTickets(organizationId, null),
      getReminderList(organizationId, null, REMINDER_ACTIVE_STATUSES),
    ]);

    const newTickets: DailySummaryTicketRow[] = reportedToday.map((t) => ({
      id: t.id,
      title: t.title,
      buildingName: t.buildingName,
      publicCode: t.publicCode,
    }));

    const urgentUnresolvedTickets: DailySummaryTicketRow[] = attentionTickets
      .filter((t) => t.priority === "urgent")
      .map((t) => ({
        id: t.id,
        title: t.title,
        buildingName: t.buildingName,
        publicCode: t.publicCode,
      }));

    // `for` en vez de map+filter: la urgencia sale de una función que
    // devuelve un union de 3 valores (getReminderUrgency), y el guard
    // `=== "ok"` acá deja a TypeScript angostar el tipo solo (sin un type
    // predicate a mano) a los dos valores que sí necesita
    // DailySummaryReminderRow.
    const remindersNeedingAttention: DailySummaryReminderRow[] = [];
    for (const r of reminders) {
      const urgency = getReminderUrgency(r.dueDate, r.noticeDays, todaySlug);
      if (urgency === "ok") {
        continue;
      }
      remindersNeedingAttention.push({
        id: r.id,
        title: r.title,
        buildingName: r.buildingName,
        urgency,
      });
    }

    const content = buildDailySummaryEmail({
      organizationName: org.name,
      dateLabel: formatLongDate(now, org.timezone),
      appUrl: env.NEXT_PUBLIC_APP_URL,
      newTickets,
      urgentUnresolvedTickets,
      remindersNeedingAttention,
    });

    const result = await getEmailProvider().send({
      to: adminEmails,
      subject: content.subject,
      html: content.html,
    });

    if (!result.ok) {
      console.error(
        `[sendDailySummaryEmail] Resend no pudo enviar el resumen de la organización ${organizationId}: ${result.error}`,
      );
    }
  } catch (error) {
    console.error(
      `[sendDailySummaryEmail] Falló el armado/envío del resumen para la organización ${organizationId}:`,
      error,
    );
  }
}
