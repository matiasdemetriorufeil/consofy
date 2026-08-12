import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { denyAnonAuthenticated, idColumn, timestamps } from "./_shared";
import { buildings } from "./buildings";
import { categories } from "./categories";
import { organizations } from "./organizations";

// Enum propio, no ticketStatus reutilizado: un incidente es una agrupación
// liviana de reclamos, no repite la granularidad de cada reclamo (eso ya lo
// trackea tickets.status). "new" no aplica -- un incidente nace ya
// agrupando reclamos existentes, no hay un estado previo de "sin triage".
// "discarded" tampoco -- si una agrupación resulta equivocada, se
// desasocian los reclamos (tickets.incident_id -> NULL) o se borra el
// incidente (deleted_at), no hace falta un estado propio para "esto fue un
// error". "in_progress" tampoco: no aporta nada sobre lo que ya cuentan los
// reclamos asociados. Dos estados alcanzan para lo que el incidente en sí
// necesita representar.
export const incidentStatus = pgEnum("incident_status", ["open", "resolved"]);

export const incidents = pgTable(
  "incidents",
  {
    id: idColumn(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    // NOT NULL: un incidente agrupa reclamos de un edificio puntual -- no
    // hay (todavía) un caso de uso para "un problema en común" que cruce
    // edificios distintos; cada edificio tiene su propia infraestructura.
    buildingId: uuid("building_id").notNull(),
    // NOT NULL: agrupar reclamos sin decir de qué tipo de problema se trata
    // vacía buena parte del propósito de un incidente (ej. "vecinos que
    // reportan la misma pérdida de agua" ya asume la categoría plomería).
    categoryId: uuid("category_id").notNull(),
    title: text("title").notNull(),
    status: incidentStatus("status").notNull().default("open"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    foreignKey({
      columns: [t.buildingId, t.organizationId],
      foreignColumns: [buildings.id, buildings.organizationId],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.categoryId, t.organizationId],
      foreignColumns: [categories.id, categories.organizationId],
    }).onDelete("restrict"),
    // Necesaria para que tickets.incident_id y
    // notifications.related_incident_id referencien
    // incidents(id, organization_id) con FK compuesta. Ver CLAUDE.md >
    // Integridad entre organizaciones.
    unique("incidents_id_organization_id_unique").on(t.id, t.organizationId),
    // Mismo patrón que tickets_resolved_at_requires_resolved_or_closed.
    check(
      "incidents_resolved_at_requires_resolved",
      sql`${t.resolvedAt} is null or ${t.status} = 'resolved'`,
    ),
    denyAnonAuthenticated(),
  ],
).enableRLS();

// Qué pasa al resolver un incidente con reclamos asociados (¿se resuelven
// en cascada, quedan independientes, se le pide confirmación al
// administrador reclamo por reclamo?) es una decisión de producto que la
// etapa 7 tiene más contexto para tomar -- no se implementa acá. El
// esquema no bloquea ninguna de esas opciones: tickets.status es
// independiente de incidents.status, así que la etapa 7 puede elegir
// cascada automática (una Server Action o un trigger que recorra
// tickets.incident_id = este id), aviso manual, o ambas cosas, sin
// necesitar una migración nueva para habilitarlo.
