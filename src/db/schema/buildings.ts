import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { denyAnonAuthenticated, idColumn, timestamps } from "./_shared";
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
    // Prefijo legible para tickets.public_code ("TC" de "Torre Central" ->
    // "TC-2026-0143"). Mayúsculas fijo (no se normaliza en la app: si se
    // permitiera minúsculas habría que decidir case-folding en dos lugares
    // -- acá y en el trigger que arma el código -- y sería una fuente de
    // bugs sutiles si algún día difieren). Ver CHECK de formato más abajo.
    codePrefix: text("code_prefix").notNull(),
    adminWhatsappE164: text("admin_whatsapp_e164").notNull(),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    // Redundante con la PK (id) para probar unicidad de id solo, pero
    // obligatoria para que units pueda tener una FK compuesta
    // (building_id, organization_id) -> buildings(id, organization_id):
    // Postgres exige una unique/PK constraint exacta sobre esas dos
    // columnas, no la deriva de que id ya sea único por sí solo. Ver
    // CLAUDE.md > Integridad entre organizaciones.
    unique("buildings_id_organization_id_unique").on(t.id, t.organizationId),
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
    // Único (organization_id, code_prefix) entre edificios NO borrados
    // (parcial): mismo motivo que slug -- un edificio dado de baja no debe
    // bloquear reutilizar su prefijo. Es lo que garantiza, junto con el
    // contador por (building_id, year), que dos reclamos de la misma
    // organización nunca compartan public_code -- ver tickets.ts.
    uniqueIndex("buildings_organization_id_code_prefix_unique")
      .on(t.organizationId, t.codePrefix)
      .where(sql`${t.deletedAt} is null`),
    // Sin guiones al principio/final ni consecutivos: "torre-norte" válido,
    // "-torre" / "torre-" / "torre--norte" / "-" inválidos, "t" válido.
    check("buildings_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    // Solo A-Z mayúsculas, 2 a 4 caracteres: "TC", "TNOR", no "tc" ni "T"
    // ni "TORRE1".
    check(
      "buildings_code_prefix_format",
      sql`${t.codePrefix} ~ '^[A-Z]{2,4}$'`,
    ),
    check(
      // \\+ (no \+): en un template string de JS, \+ no es un escape
      // reconocido y el backslash se pierde antes de llegar a Postgres,
      // dejando '^+...' -- una regex distinta que no exige el "+" literal
      // de E.164. Con \\+ el string en runtime sí contiene \+.
      "buildings_admin_whatsapp_e164_format",
      sql`${t.adminWhatsappE164} ~ '^\\+[1-9][0-9]{1,14}$'`,
    ),
    denyAnonAuthenticated(),
  ],
).enableRLS();
