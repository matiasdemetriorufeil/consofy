import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { idColumn, timestamps } from "./_shared";
import { organizations } from "./organizations";

export const buildings = pgTable(
  "buildings",
  {
    id: idColumn(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    address: text("address").notNull(),
    city: text("city").notNull(),
    // Único dentro de la organización, no global: dos organizaciones
    // distintas pueden tener cada una un edificio "torre-norte".
    slug: text("slug").notNull(),
    // Distinto de `id` a propósito: es el identificador que viaja en la URL
    // pública (/r/[token]) y tiene que poder rotarse/regenerarse sin tocar
    // la identidad interna de la fila ni las FKs que apuntan a ella.
    // uuid con default aleatorio ya cumple "no adivinable ni secuencial".
    publicToken: uuid("public_token").notNull().defaultRandom().unique(),
    adminWhatsappE164: text("admin_whatsapp_e164").notNull(),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    // Único (organization_id, slug) entre edificios ACTIVOS solamente
    // (parcial, WHERE deleted_at IS NULL): con borrado lógico, un índice
    // único total impediría reutilizar el slug de un edificio dado de baja,
    // porque la fila borrada -invisible para el usuario- lo seguiría
    // ocupando.
    uniqueIndex("buildings_organization_id_slug_unique")
      .on(t.organizationId, t.slug)
      .where(sql`${t.deletedAt} is null`),
    // Al ser parcial, el índice de arriba ya no sirve para "listar TODOS los
    // edificios de esta organización" (activos + dados de baja, ej. una
    // papelera o una vista de auditoría) porque esa consulta no garantiza
    // deleted_at IS NULL. Este índice plano cubre ese caso.
    index("buildings_organization_id_idx").on(t.organizationId),
    // Sin guiones al principio/final ni consecutivos: "torre-norte" válido,
    // "-torre" / "torre-" / "torre--norte" / "-" inválidos, "t" válido.
    check("buildings_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check(
      // \\+ (no \+): en un template string de JS, \+ no es un escape
      // reconocido y el backslash se pierde antes de llegar a Postgres,
      // dejando '^+...' -- una regex distinta que no exige el "+" literal
      // de E.164. Con \\+ el string en runtime sí contiene \+.
      "buildings_admin_whatsapp_e164_format",
      sql`${t.adminWhatsappE164} ~ '^\\+[1-9][0-9]{1,14}$'`,
    ),
  ],
).enableRLS();
