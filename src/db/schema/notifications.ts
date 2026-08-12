import { sql } from "drizzle-orm";
import {
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { denyAnonAuthenticated, idColumn, timestamps } from "./_shared";
import { incidents } from "./incidents";
import { organizations } from "./organizations";
import { reminders } from "./reminders";
import { tickets } from "./tickets";

// Lista mínima ligada a las tres columnas related_*_id de abajo, no el
// listado completo del paso 9.4 (todavía no definido en este punto del
// plan) -- inventar ahora los casos exactos de un paso futuro sería
// modelar sobre una especificación que no existe. Postgres permite
// ALTER TYPE ... ADD VALUE más adelante sin reescribir la tabla, así que
// ampliar esta lista en 9.4 es barato.
export const notificationType = pgEnum("notification_type", [
  "new_ticket",
  "reminder_due",
  "incident_updated",
  "system",
]);

export const notifications = pgTable(
  "notifications",
  {
    id: idColumn(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    type: notificationType("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    // Ruta interna del panel a la que navega al hacer click (ej.
    // "/tickets/xyz"), no una URL externa. Texto libre porque cada tipo de
    // notificación lleva a una ruta distinta.
    link: text("link"),
    relatedTicketId: uuid("related_ticket_id"),
    relatedReminderId: uuid("related_reminder_id"),
    relatedIncidentId: uuid("related_incident_id"),
    // NO es append-only como ticket_events, a diferencia de lo que su forma
    // sugeriría a primera vista: read_at es una mutación real y esperada
    // (marcar como leída), no un evento nuevo -- una notificación vive como
    // una sola fila que pasa de no leída a leída, no como un log de
    // eventos por notificación. Por eso sí lleva updated_at (con su
    // trigger set_updated_at) y deleted_at, a diferencia de ticket_events.
    readAt: timestamp("read_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    // Las tres son MATCH SIMPLE (nullable): una notificación puede no estar
    // ligada a ninguna entidad puntual (ej. type = 'system'), o estar
    // ligada a como mucho una de las tres según su type.
    foreignKey({
      columns: [t.relatedTicketId, t.organizationId],
      foreignColumns: [tickets.id, tickets.organizationId],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.relatedReminderId, t.organizationId],
      foreignColumns: [reminders.id, reminders.organizationId],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.relatedIncidentId, t.organizationId],
      foreignColumns: [incidents.id, incidents.organizationId],
    }).onDelete("restrict"),
    // "Notificaciones no leídas de la organización": parcial, WHERE
    // read_at IS NULL -- exactamente el filtro de la consulta, y mantiene
    // el índice chico aunque se acumulen años de notificaciones ya leídas
    // (que superan ampliamente a las no leídas en cualquier momento dado).
    index("notifications_organization_id_unread_idx")
      .on(t.organizationId)
      .where(sql`${t.readAt} is null`),
    denyAnonAuthenticated(),
  ],
).enableRLS();
