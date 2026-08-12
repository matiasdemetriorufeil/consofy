import { sql } from "drizzle-orm";
import { pgPolicy, timestamp, uuid } from "drizzle-orm/pg-core";

// gen_random_uuid() es nativo de Postgres desde la versión 13 (confirmado:
// esta base corre PG 17) — no hace falta habilitar pgcrypto.
export function idColumn() {
  return uuid("id").primaryKey().defaultRandom();
}

// Política explícita de denegación total para anon/authenticated, en TODAS
// las tablas -- ver CLAUDE.md > Políticas RLS. `.enableRLS()` solo prende el
// motor de RLS; sin al menos una policy, el resultado para anon/
// authenticated ya es "deniega todo" (no hay ninguna policy que les
// permita nada), pero Supabase señala ese estado como INFO en su linter de
// seguridad (0008_rls_enabled_no_policy) porque es ambiguo: no se puede
// distinguir "está bloqueado a propósito" de "se olvidaron de escribir las
// policies". Esta policy hace la intención explícita -- USING (false) para
// SELECT/UPDATE/DELETE, WITH CHECK (false) para INSERT/UPDATE.
//
// RESTRICTIVE, no PERMISSIVE (el default): con PERMISSIVE, esta policy
// hubiera sido inofensiva hoy (es la única), pero las policies PERMISSIVE
// se combinan con OR -- si algún día alguien agrega, para el mismo rol y
// comando, una policy PERMISSIVE nueva que sí permita algo (ej. "los
// residentes ven sus propios documentos"), esta policy de acá NO la
// bloquearía: false OR <lo que sea que permita la nueva> sigue dejando
// pasar filas. Como RESTRICTIVE, en cambio, se combina con AND contra
// TODAS las policies (incluidas las PERMISSIVE futuras) -- false AND
// cualquier-cosa siempre da false. Es la única forma de que "anon/
// authenticated no acceden nunca a esta tabla" sea una garantía estructural
// que sobrevive a cambios futuros, no solo el estado por default de hoy.
export function denyAnonAuthenticated() {
  return pgPolicy("deny_anon_authenticated", {
    as: "restrictive",
    for: "all",
    to: ["anon", "authenticated"],
    using: sql`false`,
    withCheck: sql`false`,
  });
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
