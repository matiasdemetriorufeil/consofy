import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { idColumn, timestamps } from "./_shared";
import { buildings } from "./buildings";
import { categories, ticketPriority } from "./categories";
import { incidents } from "./incidents";
import { organizations } from "./organizations";
import { people } from "./people";
import { units } from "./units";

// Valores en inglés (dato de base, no UI) -- ver CLAUDE.md > Glosario.
export const ticketStatus = pgEnum("ticket_status", [
  "new",
  "in_progress",
  "resolved",
  "closed",
  "discarded",
]);

// De dónde entró el reclamo a la base.
export const ticketSource = pgEnum("ticket_source", [
  "public_form",
  "admin",
  "whatsapp",
]);

export const tickets = pgTable(
  "tickets",
  {
    id: idColumn(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    // NOT NULL: todo reclamo entra por un edificio puntual -- el
    // formulario público se accede vía el token público DE un edificio
    // (/r/[token]), y el panel siempre trabaja "la bandeja de este
    // edificio". No hay ningún flujo de la app que produzca un reclamo sin
    // edificio.
    buildingId: uuid("building_id").notNull(),
    // Nullable a propósito: el vecino que no encuentra su unidad en la
    // lista (paso 5.3 del plan) tiene que poder cargar igual el reclamo.
    // Cuando es NULL, unit_label_raw lo reemplaza -- ver el CHECK más
    // abajo, que exige al menos uno de los dos.
    unitId: uuid("unit_id"),
    // Nullable: no todo reclamo tiene detrás a un vecino identificado (ej.
    // el administrador carga un reclamo propio sobre un espacio común,
    // "gotea el tanque", sin que lo haya reportado una persona puntual).
    // El formulario público SÍ va a tener siempre una persona, porque ese
    // flujo busca/crea a la persona por teléfono antes de guardar (ver
    // CLAUDE.md > Acceso a datos) -- pero esa es una garantía que da la
    // aplicación para ESE origen, no algo que la base deba (ni pueda)
    // exigir para los otros dos orígenes (admin, whatsapp).
    personId: uuid("person_id"),
    // NOT NULL: toda organización va a tener siempre una categoría
    // genérica disponible ("Otro"), así que elegir alguna categoría nunca
    // es imposible. Si una categoría se da de baja más adelante
    // (soft-delete vía deleted_at, nunca DELETE físico -- ver CLAUDE.md >
    // Convenciones), los reclamos históricos que la referencian siguen
    // siendo válidos: la fila de categories sigue existiendo con ese
    // organization_id, solo oculta del picker -- la FK compuesta de abajo
    // no exige que la categoría esté activa, solo que exista.
    categoryId: uuid("category_id").notNull(),
    // Texto libre para cuando unit_id es NULL (ver arriba). Con unit_id
    // seteado puede tener o no contenido igual -- no se pisa ni se limpia,
    // queda tal cual lo escribió el vecino.
    unitLabelRaw: text("unit_label_raw"),
    title: text("title").notNull(),
    description: text("description").notNull(),
    priority: ticketPriority("priority").notNull(),
    status: ticketStatus("status").notNull().default("new"),
    source: ticketSource("source").notNull(),
    // Texto libre a propósito: todavía no existe una tabla de
    // responsables/usuarios del panel. Cuando exista, este campo se
    // reemplaza por una FK -- no antes, para no modelar en este paso una
    // tabla que no fue pedida.
    assignee: text("assignee"),
    publicCode: text("public_code")
      .notNull()
      // Default "vacío" real pero irrelevante en la práctica: lo pone
      // SIEMPRE el trigger set_ticket_public_code() (BEFORE INSERT, creado
      // en la migración 0007 y con el formato PREFIJO-AÑO-NNNN desde la
      // 0009), que sobreescribe el valor sin condición en cada INSERT. Este
      // default solo existe para que Drizzle no exija
      // public_code en el tipo de INSERT de la aplicación -- ningún código
      // de la app debe setearlo a mano, ni podría acertar el valor
      // correcto sin repetir la lógica del contador.
      .default(sql`''`),
    // Distinto de created_at: es la fecha de negocio ("cuándo se reportó
    // el problema"), que un administrador tiene que poder backdatear al
    // cargar un reclamo que le llegó ayer por teléfono. created_at es
    // puramente de auditoría (cuándo se escribió la fila) y nunca se
    // edita.
    reportedAt: timestamp("reported_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    // La columna se agregó sin FK en el paso 2.4 (incidents todavía no
    // existía). Ahora sí tiene su FK compuesta -- ver más abajo.
    incidentId: uuid("incident_id"),
    ...timestamps(),
  },
  (t) => [
    foreignKey({
      columns: [t.buildingId, t.organizationId],
      foreignColumns: [buildings.id, buildings.organizationId],
    }).onDelete("restrict"),
    // FK compuesta con columna referenciante nullable: Postgres (MATCH
    // SIMPLE, el default) no exige que exista una fila coincidente cuando
    // unit_id es NULL -- la constraint solo se evalúa cuando AMBAS
    // columnas están presentes. Es exactamente el comportamiento que
    // queremos: "sin unidad elegida" no debe fallar, pero "unidad elegida
    // de otra organización" sí.
    foreignKey({
      columns: [t.unitId, t.organizationId],
      foreignColumns: [units.id, units.organizationId],
    }).onDelete("restrict"),
    // Mismo razonamiento MATCH SIMPLE que unit_id.
    foreignKey({
      columns: [t.personId, t.organizationId],
      foreignColumns: [people.id, people.organizationId],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.categoryId, t.organizationId],
      foreignColumns: [categories.id, categories.organizationId],
    }).onDelete("restrict"),
    // Pendiente desde el paso 2.4 (incidents no existía todavía). Nullable
    // (MATCH SIMPLE): la mayoría de los reclamos nunca se agrupan en un
    // incidente. onDelete restrict igual que el resto -- no tiene sentido
    // borrar físicamente un incidente con reclamos que todavía lo
    // referencian.
    foreignKey({
      columns: [t.incidentId, t.organizationId],
      foreignColumns: [incidents.id, incidents.organizationId],
    }).onDelete("restrict"),
    // Necesaria para que ticket_attachments y ticket_events referencien
    // tickets(id, organization_id) con FK compuesta. Ver CLAUDE.md >
    // Integridad entre organizaciones.
    unique("tickets_id_organization_id_unique").on(t.id, t.organizationId),
    // Único POR ORGANIZACIÓN, no global (cambio del paso 2.4b): el código
    // ahora lleva el prefijo del edificio (PREFIJO-AÑO-NNNN), que solo es
    // único DENTRO de cada organización (dos organizaciones distintas
    // pueden tener cada una un edificio con prefijo "TC"). Un UNIQUE global
    // sobre public_code dejaría que un reclamo de la organización B hiciera
    // fallar un INSERT de la organización A por una coincidencia de código
    // totalmente ajena a ella -- un bug real, no solo un caso raro.
    //
    // Por qué esto no rompe nada: el único lugar donde alguien busca un
    // reclamo por public_code es el formulario público de consulta de
    // estado, que llega vía el token de un edificio puntual -- ahí ya se
    // conoce la organización antes de leer el código, así que nunca hace
    // falta una búsqueda ciega global. Total, no parcial (sin WHERE
    // deleted_at IS NULL): un código ya emitido no se reutiliza ni aunque
    // el reclamo se borre lógicamente -- mismo criterio que
    // buildings.public_token.
    unique("tickets_organization_id_public_code_unique").on(
      t.organizationId,
      t.publicCode,
    ),
    // Al menos uno de los dos: sin esto, un reclamo podría quedar sin
    // ninguna forma de ubicar la unidad (ni id ni texto libre).
    check(
      "tickets_unit_id_or_label_present",
      sql`${t.unitId} is not null or ${t.unitLabelRaw} is not null`,
    ),
    // Pedida explícitamente: resolved_at solo tiene sentido si el estado
    // ya pasó por resuelto (o cerrado, que lo sucede).
    check(
      "tickets_resolved_at_requires_resolved_or_closed",
      sql`${t.resolvedAt} is null or ${t.status} in ('resolved', 'closed')`,
    ),
    // Invariante que propongo por simetría con la de arriba: closed_at
    // solo tiene sentido con estado closed.
    check(
      "tickets_closed_at_requires_closed",
      sql`${t.closedAt} is null or ${t.status} = 'closed'`,
    ),
    // Invariante que propongo: orden cronológico entre las tres fechas,
    // cuando están presentes -- evita datos corruptos como un reclamo
    // "resuelto" antes de haber sido reportado.
    check(
      "tickets_timestamps_chronological",
      sql`(${t.resolvedAt} is null or ${t.resolvedAt} >= ${t.reportedAt}) and (${t.closedAt} is null or ${t.resolvedAt} is null or ${t.closedAt} >= ${t.resolvedAt})`,
    ),
    // Bandeja filtrada por edificio y estado, ordenada por fecha de
    // reporte: WHERE building_id = ? AND status = ? ORDER BY reported_at.
    // Esta misma columna líder (building_id, status) sirve también
    // "contar reclamos por estado" del dashboard -- es un GROUP BY status
    // dentro de un edificio, que ya viaja con el mismo prefijo de índice;
    // no hace falta un índice aparte para eso.
    index("tickets_building_id_status_reported_at_idx").on(
      t.buildingId,
      t.status,
      t.reportedAt,
    ),
    // Bandeja filtrada por edificio + categoría + ventana temporal: la
    // detección de duplicados de la etapa 7 (WHERE building_id = ? AND
    // category_id = ? AND reported_at BETWEEN ? AND ?).
    index("tickets_building_id_category_id_reported_at_idx").on(
      t.buildingId,
      t.categoryId,
      t.reportedAt,
    ),
  ],
).enableRLS();
