import {
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { denyAnonAuthenticated, idColumn, timestamps } from "./_shared";
import { buildings } from "./buildings";
import { organizations } from "./organizations";

export const announcementStatus = pgEnum("announcement_status", [
  "draft",
  "scheduled",
  "sending",
  "sent",
  "failed",
]);

export const announcements = pgTable(
  "announcements",
  {
    id: idColumn(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    // Nullable: un aviso de TODA la organización tiene sentido en este
    // producto -- un administrador con varios edificios va a querer mandar
    // "feliz año nuevo" una sola vez, no repetirlo edificio por edificio.
    // Cuando es NULL, segment (ver abajo) es la única forma de acotar
    // destinatarios; en la práctica "towers"/"floors" dejan de tener
    // sentido sin un edificio de referencia (no hay una "torre 2" que
    // cruce edificios distintos), así que un aviso NULL en general solo va
    // a filtrar por roles o personas puntuales.
    buildingId: uuid("building_id"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    // Criterio de destinatarios, validado con Zod en la capa de aplicación
    // (no acá). Forma esperada:
    //   {
    //     towers?: string[];               // solo con building_id != null
    //     floors?: string[];                // idem
    //     roles?: ("owner" | "tenant")[];
    //     personIds?: string[];             // si está presente, ANULA el
    //                                        // resto de los filtros: envía
    //                                        // solo a estas personas
    //   }
    // Objeto vacío {} = todos los destinatarios elegibles del alcance (el
    // edificio, o toda la organización si building_id es NULL).
    segment: jsonb("segment").notNull().default({}),
    status: announcementStatus("status").notNull().default("draft"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    // Texto libre a propósito, mismo motivo que tickets.assignee: todavía
    // no existe una tabla de usuarios del panel. Distinto de assignee en
    // nullability: quien crea un aviso siempre se conoce en el momento de
    // crearlo (no hay un estado "sin autor todavía").
    createdBy: text("created_by").notNull(),
    ...timestamps(),
  },
  (t) => [
    // FK compuesta con columna nullable: MATCH SIMPLE (default de
    // Postgres) no exige match cuando building_id es NULL -- exactamente
    // lo que hace falta para un aviso de toda la organización.
    foreignKey({
      columns: [t.buildingId, t.organizationId],
      foreignColumns: [buildings.id, buildings.organizationId],
    }).onDelete("restrict"),
    // Necesaria para que announcement_recipients referencie
    // announcements(id, organization_id) con FK compuesta.
    unique("announcements_id_organization_id_unique").on(
      t.id,
      t.organizationId,
    ),
    // "Avisos de un edificio ordenados por fecha".
    index("announcements_building_id_created_at_idx").on(
      t.buildingId,
      t.createdAt,
    ),
    denyAnonAuthenticated(),
  ],
).enableRLS();
