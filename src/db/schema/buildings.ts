import { sql } from "drizzle-orm";
import {
  boolean,
  check,
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
    // Único (organization_id, slug): hace de constraint de negocio Y de
    // índice para "buscar edificio por slug dentro de esta organización".
    // Al tener organization_id como columna líder, también sirve para
    // "listar edificios de esta organización" sin necesitar un índice
    // aparte solo sobre organization_id.
    uniqueIndex("buildings_organization_id_slug_unique").on(
      t.organizationId,
      t.slug,
    ),
    check("buildings_slug_format", sql`${t.slug} ~ '^[a-z0-9-]+$'`),
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
