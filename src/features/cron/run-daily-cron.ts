import "server-only";

import { isNull } from "drizzle-orm";

import { db } from "@/db";
import { organizations } from "@/db/schema";
import { sendDailySummaryEmail } from "@/features/notifications/email/send-daily-summary-email";
import { sweepDueReminders } from "@/features/reminders/sweep-due-reminders";
import { sweepOverdueTickets } from "@/features/tickets/sweep-overdue-tickets";

export type DailyCronOrgResult = {
  organizationId: string;
  ticketsNotified: number | null;
  remindersNotified: number | null;
  dailySummaryStatus: string;
};

export type DailyCronResult = {
  organizationsProcessed: number;
  ticketsNotifiedTotal: number;
  remindersNotifiedTotal: number;
  dailySummariesSent: number;
  errors: string[];
  perOrganization: DailyCronOrgResult[];
};

// Todas las organizaciones NO dadas de baja -- "activa" acá es
// exactamente eso, `organizations` no tiene un booleano `active` propio
// (a diferencia de `buildings.active`), solo `deleted_at` (ver
// src/db/schema/organizations.ts). Sin extraer a un `queries.ts` de
// organizations propio -- no existe ese archivo todavía en el proyecto
// (send-daily-summary-email.ts, paso 9.5, ya optó por resolver su propio
// SELECT de una fila en vez de crear ese archivo para un solo consumidor;
// acá pasa lo mismo, un único consumidor).
async function getActiveOrganizations(): Promise<
  { id: string; timezone: string }[]
> {
  return db
    .select({ id: organizations.id, timezone: organizations.timezone })
    .from(organizations)
    .where(isNull(organizations.deletedAt));
}

// Orquestador del cron diario (paso 9.6) -- conecta, por cada organización
// activa, las tres piezas que ya existían pero nunca se dispararon solas:
// el barrido de reclamos vencidos (9.4), el de recordatorios (9.4) y el
// resumen diario por email (9.5). Llamado por el único caller real,
// `src/app/api/cron/daily/route.ts`, después de validar el secreto.
//
// Aislamiento de errores (punto 7 del enunciado: "si una de las tres
// tareas falla, las otras dos igual se tienen que ejecutar -- no todo o
// nada") en DOS niveles, no uno:
// 1. Las tres funciones que se llaman acá (`sweepOverdueTickets`,
//    `sweepDueReminders`, `sendDailySummaryEmail`) ya tienen su propia
//    REGLA DURA de "nunca propaga una excepción" (mismo patrón que
//    `detectAndFlagSimilarTickets`, paso 7.2) -- de por sí, que UNA falle
//    no impide que la línea siguiente corra.
// 2. Cada llamada, ACÁ TAMBIÉN, vive en su propio try/catch -- defensa
//    en profundidad, no confianza ciega en que esa garantía se mantenga
//    para siempre: si alguien la rompe en el futuro (un cambio que
//    reintroduce un `throw` sin querer), una organización no puede
//    tumbar el barrido de las demás, ni una tarea puede impedir que las
//    otras dos de la MISMA organización corran.
//
// "Qué falló, de forma revisable después" (punto 7): mismo criterio ya
// establecido en el proyecto -- `console.error` con el nombre de la
// función entre corchetes (cada una de las tres ya lo hace por su
// cuenta). Este orquestador ADEMÁS junta un resumen (`errors`,
// `perOrganization`) en el JSON de respuesta del endpoint -- así el log
// de la corrida de GitHub Actions (que captura stdout/stderr del curl,
// no los logs del servidor de Next) tiene algo revisable sin tener que
// cruzarlo con los logs de Vercel.
export async function runDailyCron(): Promise<DailyCronResult> {
  const now = new Date();
  const orgs = await getActiveOrganizations();

  const result: DailyCronResult = {
    organizationsProcessed: orgs.length,
    ticketsNotifiedTotal: 0,
    remindersNotifiedTotal: 0,
    dailySummariesSent: 0,
    errors: [],
    perOrganization: [],
  };

  for (const org of orgs) {
    let ticketsNotified: number | null = null;
    try {
      const ticketResult = await sweepOverdueTickets(org.id, now);
      if (ticketResult.ok) {
        ticketsNotified = ticketResult.notifiedCount;
        result.ticketsNotifiedTotal += ticketResult.notifiedCount;
      } else {
        result.errors.push(
          `[org ${org.id}] sweepOverdueTickets: ${ticketResult.error}`,
        );
      }
    } catch (error) {
      result.errors.push(
        `[org ${org.id}] sweepOverdueTickets: ${String(error)}`,
      );
    }

    let remindersNotified: number | null = null;
    try {
      const reminderResult = await sweepDueReminders(org.id, org.timezone, now);
      if (reminderResult.ok) {
        remindersNotified = reminderResult.notifiedCount;
        result.remindersNotifiedTotal += reminderResult.notifiedCount;
      } else {
        result.errors.push(
          `[org ${org.id}] sweepDueReminders: ${reminderResult.error}`,
        );
      }
    } catch (error) {
      result.errors.push(`[org ${org.id}] sweepDueReminders: ${String(error)}`);
    }

    let dailySummaryStatus = "error";
    try {
      const summaryResult = await sendDailySummaryEmail(org.id);
      dailySummaryStatus = summaryResult.status;
      if (summaryResult.status === "sent") {
        result.dailySummariesSent += 1;
      } else if (summaryResult.status === "error") {
        result.errors.push(
          `[org ${org.id}] sendDailySummaryEmail: ${summaryResult.error}`,
        );
      }
    } catch (error) {
      result.errors.push(
        `[org ${org.id}] sendDailySummaryEmail: ${String(error)}`,
      );
    }

    result.perOrganization.push({
      organizationId: org.id,
      ticketsNotified,
      remindersNotified,
      dailySummaryStatus,
    });
  }

  return result;
}
