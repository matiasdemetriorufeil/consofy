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

// Ampliado en 9.4 (corrección de alcance, ver CLAUDE.md > Generación
// automática de notificaciones) a los 5 eventos reales del plan --
// `ALTER TYPE ... ADD VALUE` es barato, como ya anticipaba este comentario
// desde el paso 9.3.
//
// - new_ticket / urgent_ticket: dos tipos separados para el mismo evento
//   ("se creó un reclamo") en vez de uno solo con contenido condicional --
//   ver el razonamiento en CLAUDE.md, es una decisión técnica (mantener
//   `type` como señal confiable de qué clase de notificación es cada fila,
//   sin tener que mirar el título) no de negocio.
// - ticket_overdue: reclamo abierto hace más de N días (paso 9.4, función
//   pura lista; el disparo automático es del cron de 9.6, ver CLAUDE.md).
// - reminder_due: ya existía desde 9.3 sin generador; ahora tiene su
//   función de contenido (9.4), pero el disparo sigue siendo del cron de
//   9.6, igual que ticket_overdue.
// - incident_updated / incident_multi_unit: mismo criterio que new_ticket/
//   urgent_ticket -- dos eventos reales distintos sobre un incidente
//   (se resolvió vs. pasó a afectar varias unidades), cada uno con su
//   propio type para poder chequear idempotencia sin ambigüedad (ver el
//   comentario de maybeNotifyMultiUnitIncident en
//   group-tickets-into-incident.ts).
export const notificationType = pgEnum("notification_type", [
  "new_ticket",
  "urgent_ticket",
  "reminder_due",
  "incident_updated",
  "incident_multi_unit",
  "ticket_overdue",
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
