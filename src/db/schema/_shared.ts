import { timestamp, uuid } from "drizzle-orm/pg-core";

// gen_random_uuid() es nativo de Postgres desde la versión 13 (confirmado:
// esta base corre PG 17) — no hace falta habilitar pgcrypto.
export function idColumn() {
  return uuid("id").primaryKey().defaultRandom();
}

// updated_at no se actualiza solo: cada Server Action que haga UPDATE es
// responsable de setearlo. No hay trigger de base para esto (fuera de
// alcance de este paso).
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
