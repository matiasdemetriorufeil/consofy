import { timestamp, uuid } from "drizzle-orm/pg-core";

// gen_random_uuid() es nativo de Postgres desde la versión 13 (confirmado:
// esta base corre PG 17) — no hace falta habilitar pgcrypto.
export function idColumn() {
  return uuid("id").primaryKey().defaultRandom();
}

// updated_at lo actualiza un trigger de base (set_updated_at(), ver la
// migración 0002) en cada UPDATE de una fila. Las Server Actions NO deben
// setearlo a mano: si lo hacen, el valor que manden se pisa igual con
// now() antes de escribir, así que en el mejor caso es código muerto y en
// el peor genera confusión sobre quién es dueño del campo.
export function timestamps() {
  return {
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  };
}
