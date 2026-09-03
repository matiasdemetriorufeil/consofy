import { date, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { denyAnonAuthenticated, idColumn, timestamps } from "./_shared";

export const organizations = pgTable(
  "organizations",
  {
    id: idColumn(),
    name: text("name").notNull(),
    timezone: text("timezone").notNull().default("America/Argentina/Cordoba"),
    // Identificador que viaja en la URL pública `/o/[token]` (paso 17.1):
    // la página intermedia que le muestra a un vecino los edificios de esta
    // organización para que elija el suyo, cuando le escribió al
    // administrador por WhatsApp (un solo número para varios edificios) y
    // todavía no tiene el link de su edificio. MISMO mecanismo que
    // `buildings.public_token` (paso 4.6, ver ese comentario en
    // src/db/schema/buildings.ts): uuid aleatorio, no adivinable ni
    // secuencial, rotable sin tocar la identidad interna de la fila ni las
    // FKs que la referencian. `.unique()` TOTAL, no parcial: un token de
    // URL pública no se reutiliza aunque algún día la organización se
    // archive -- mismo criterio que el de buildings (ver CLAUDE.md >
    // Acceso a datos). Se resuelve server-only en
    // getOrganizationByPublicToken (src/features/public-form/queries.ts),
    // igual que getBuildingByPublicToken.
    publicToken: uuid("public_token").notNull().defaultRandom().unique(),
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
