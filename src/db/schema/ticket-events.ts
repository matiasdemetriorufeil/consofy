import {
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { denyAnonAuthenticated, idColumn } from "./_shared";
import { tickets } from "./tickets";

export const ticketEventType = pgEnum("ticket_event_type", [
  "created",
  "status_changed",
  "priority_changed",
  "assigned",
  "note_added",
  "attachment_added",
  "merged_into_incident",
  "whatsapp_handoff_opened",
]);

export const ticketEventActorType = pgEnum("ticket_event_actor_type", [
  "neighbor",
  "admin",
  "system",
]);

export const ticketEvents = pgTable(
  "ticket_events",
  {
    id: idColumn(),
    // Denormalizado desde tickets.organization_id -- hace posible la FK
    // compuesta de abajo. Ver CLAUDE.md > Integridad entre organizaciones.
    organizationId: uuid("organization_id").notNull(),
    ticketId: uuid("ticket_id").notNull(),
    type: ticketEventType("type").notNull(),
    // Detalle específico de cada tipo de evento (ej. { from: "new", to:
    // "in_progress" } para status_changed). Forma libre a propósito: cada
    // tipo de evento define su propia forma y se valida con Zod en la capa
    // de aplicación al escribir, no con un CHECK en la base -- forzar un
    // shape único por CHECK para 8 tipos de evento distintos sería más
    // rígido que útil.
    payload: jsonb("payload").notNull().default({}),
    actorType: ticketEventActorType("actor_type").notNull(),
    // Snapshot de texto, no una FK a people ni a una futura tabla de
    // usuarios del panel: esta tabla es un log histórico -- si el nombre
    // de la persona o del administrador cambia después, el evento tiene
    // que seguir mostrando el nombre que tenía EN ESE MOMENTO, no el
    // actual. Por eso es texto congelado al momento del evento, coherente
    // con que toda la tabla es append-only (ver más abajo).
    actorLabel: text("actor_label").notNull(),
    // Solo created_at, sin usar el helper timestamps(): esta tabla es un
    // log append-only -- no se edita ni se borra nunca una vez escrita, así
    // que no lleva updated_at (nada la actualiza) ni deleted_at (nada la
    // borra, ni siquiera lógicamente: el historial de un reclamo no se
    // "da de baja" fila por fila). Por el mismo motivo tampoco lleva el
    // trigger set_updated_at: no tendría ningún UPDATE que disparar.
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.ticketId, t.organizationId],
      foreignColumns: [tickets.id, tickets.organizationId],
    }).onDelete("restrict"),
    // "Ver la línea de tiempo de este reclamo", en orden cronológico --
    // igual que ticket_attachments, no es una de las 4 consultas de
    // bandeja del punto 6 pero es la razón de ser de esta tabla.
    index("ticket_events_ticket_id_created_at_idx").on(t.ticketId, t.createdAt),
    denyAnonAuthenticated(),
  ],
).enableRLS();
