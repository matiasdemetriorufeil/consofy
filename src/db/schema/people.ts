import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { idColumn, timestamps } from "./_shared";
import { organizations } from "./organizations";

export const people = pgTable(
  "people",
  {
    id: idColumn(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    firstName: text("first_name").notNull(),
    // Nullable: el administrador a veces solo tiene un nombre de pila
    // ("el portero", "doña Rosa"), sin apellido.
    lastName: text("last_name"),
    // Nullable a propósito, aunque el teléfono es la identidad natural del
    // vecino: el formulario público SIEMPRE lo va a pedir (y ahí nunca va a
    // ser NULL en la práctica), pero el administrador tiene que poder cargar
    // a mano a alguien de quien todavía no tiene el teléfono. Si se hiciera
    // NOT NULL, cargar ese vecino a mano se vuelve imposible o fuerza un
    // valor inventado, que es peor que NULL.
    phoneE164: text("phone_e164"),
    // Nullable. Se normaliza a minúsculas: la aplicación lo hace antes de
    // guardar (mejor UX, no rebota el error), pero lo que de verdad lo
    // garantiza es el CHECK de abajo -- "no alcanza con hacerlo en la
    // aplicación" porque cualquier otro camino de escritura (una consola,
    // un script, un bug futuro) lo saltearía.
    email: text("email"),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    // Necesaria para que unit_occupancies pueda referenciar
    // people(id, organization_id) con una FK compuesta. Redundante para
    // probar que id es único (ya lo es, es la PK); obligatoria para
    // Postgres igual. Ver CLAUDE.md > Integridad entre organizaciones.
    unique("people_id_organization_id_unique").on(t.id, t.organizationId),
    // Único dentro de la organización entre personas ACTIVAS (parcial, WHERE
    // deleted_at IS NULL): mismo motivo que slug en buildings. NULL no
    // necesita coalesce acá -- dos personas con teléfono desconocido no son
    // la misma persona, y un índice único trata NULL != NULL por default,
    // que es exactamente el comportamiento que queremos.
    //
    // Esta es también LA consulta más caliente del formulario público
    // ("buscar persona por teléfono dentro de la organización"):
    // WHERE organization_id = ? AND phone_e164 = ? AND deleted_at IS NULL
    // organization_id como columna líder la sirve directo.
    uniqueIndex("people_organization_id_phone_e164_unique")
      .on(t.organizationId, t.phoneE164)
      .where(sql`${t.deletedAt} is null`),
    // "Listar todas las personas de esta organización" (activas + dadas de
    // baja, ej. una papelera): el índice de arriba es parcial y no sirve
    // para eso.
    index("people_organization_id_idx").on(t.organizationId),
    check(
      // Mismo patrón que en buildings.ts: \\+ para que el string en
      // runtime tenga el backslash literal que Postgres necesita para
      // escapar el "+" en la regex.
      "people_phone_e164_format",
      sql`${t.phoneE164} ~ '^\\+[1-9][0-9]{1,14}$'`,
    ),
    check("people_email_lowercase", sql`${t.email} = lower(${t.email})`),
  ],
).enableRLS();
