import { date, pgTable, text } from "drizzle-orm/pg-core";

import { denyAnonAuthenticated, idColumn, timestamps } from "./_shared";

export const organizations = pgTable(
  "organizations",
  {
    id: idColumn(),
    name: text("name").notNull(),
    timezone: text("timezone").notNull().default("America/Argentina/Cordoba"),
    // Paso 9.6 -- idempotencia del resumen diario por email: fecha CIVIL
    // (columna `date`, no `timestamptz` -- mismo criterio que
    // `reminders.due_date`, es "qué día fue", no un instante) en la zona
    // horaria de ESTA organización. `sendDailySummaryEmail()`
    // (notifications/email/send-daily-summary-email.ts) la chequea antes
    // de mandar nada: si ya es igual a "hoy" en la zona de la
    // organización, no manda un segundo resumen aunque el cron se
    // dispare dos veces el mismo día. Nullable -- `null` significa
    // "nunca se mandó un resumen", no un valor por defecto inventado. Se
    // actualiza SOLO tras un envío exitoso (nunca si Resend falló) para
    // no bloquear un reintento legítimo después de una falla real.
    lastDailySummarySentOn: date("last_daily_summary_sent_on"),
    ...timestamps(),
  },
  () => [denyAnonAuthenticated()],
).enableRLS();
