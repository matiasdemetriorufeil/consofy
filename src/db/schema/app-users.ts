import { sql } from "drizzle-orm";
import {
  check,
  pgEnum,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { denyAnonAuthenticated, timestamps } from "./_shared";
import { organizations } from "./organizations";

// Un solo valor hoy ("por ahora solo admin"), pero enum (no boolean/texto
// libre) para poder agregar roles después (ej. "viewer" de solo lectura)
// con un ALTER TYPE ... ADD VALUE, sin migrar la columna.
export const appUserRole = pgEnum("app_user_role", ["admin"]);

export const appUsers = pgTable(
  "app_users",
  {
    // NO usa idColumn(): esa columna trae defaultRandom(), y acá el id NO
    // se genera en la base -- tiene que ser exactamente el mismo uuid que
    // Supabase ya le asignó al usuario en auth.users al crearlo. Setearlo
    // siempre a mano en el INSERT es la única forma correcta.
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    displayName: text("display_name").notNull(),
    role: appUserRole("role").notNull().default("admin"),
    // Paso 9.5 -- a dónde mandar el resumen diario y las alertas de
    // reclamo urgente por email. Decisión tomada CON LA PERSONA: se
    // GUARDA acá, no se resuelve contra Supabase Auth en cada envío (ver
    // CLAUDE.md > Envío de emails). Mismo criterio de tipo/constraint que
    // `people.email` (normalizado a minúsculas, con el mismo CHECK) --
    // pero NOT NULL acá, a propósito, a diferencia de `people.email`: el
    // email de un vecino es un dato opcional de contacto; el de un
    // administrador es su credencial de login en Supabase Auth, así que
    // SIEMPRE existe de verdad para cualquier fila real de esta tabla (ver
    // el comentario de más abajo sobre por qué no hay FK a `auth.users`) --
    // dejar la columna nullable acá solo invitaría a que el envío de
    // emails "funcione a veces" según si alguien se olvidó de cargarla.
    // Agregada en dos migraciones (columna nullable primero, backfill,
    // recién después `SET NOT NULL`) porque ya existía al menos una fila
    // real en desarrollo sin este dato -- ver el reporte del paso 9.5 para
    // el script de backfill usado (Supabase Admin API, mismo patrón que
    // las altas/bajas de cuentas de prueba).
    email: text("email").notNull(),
    ...timestamps(),
  },
  (t) => [
    // Sin downstream hoy, pero mismo motivo que en buildings/units/people/
    // etc: cualquier tabla futura que necesite referenciar
    // app_users(id, organization_id) con FK compuesta (ej. tickets.assignee
    // dejando de ser texto libre) va a necesitar esta constraint -- ver
    // CLAUDE.md > Integridad entre organizaciones.
    unique("app_users_id_organization_id_unique").on(t.id, t.organizationId),
    check("app_users_email_lowercase", sql`${t.email} = lower(${t.email})`),
    denyAnonAuthenticated(),
  ],
).enableRLS();

// Deliberadamente SIN FOREIGN KEY hacia auth.users(id), aunque `id` siempre
// tiene que coincidir con un usuario real de ahí. Motivos:
//
// 1. auth.users vive en el esquema `auth`, que administra Supabase, no
//    nuestras migraciones -- Supabase puede alterar su forma entre
//    versiones de la plataforma, y una FK nuestra apuntando ahí quedaría
//    rota o bloqueando ese cambio sin que lo controlemos.
// 2. El rol con el que corren las migraciones (`postgres`) necesitaría el
//    privilegio REFERENCES sobre una tabla fuera de `public` -- no es algo
//    que todos los proyectos/planes de Supabase garanticen de la misma
//    forma, así que depender de eso es frágil.
//
// Cómo se mantiene la consistencia sin la FK: por invariante de aplicación,
// no de base. `app_users.id` SOLO se escribe desde un único camino
// controlado (hoy: el seed, a mano con el id que el humano crea desde el
// dashboard de Supabase Auth -- ver seed.ts; en el paso de invitación de
// usuarios que venga después, sería la Server Action que crea el usuario de
// Auth vía Admin API y en la misma operación inserta esta fila). Nunca hay
// un INSERT a app_users que no venga de haber creado o verificado el
// usuario de auth.users inmediatamente antes. Lo que esto NO cubre todavía:
// si alguien borra un usuario desde auth.users directamente (dashboard o
// Admin API) sin pasar por nuestro código, la fila de app_users queda
// huérfana -- no hay hoy un trigger ni un webhook que la limpie. Es un
// hueco real, aceptable por ahora porque el único camino de borrado de
// usuarios en este paso es manual y announced, pero si más adelante se
// habilita gestión de usuarios desde el panel, ahí conviene revisar el
// webhook de Supabase Auth (`user.deleted`) para borrar en cascada del lado
// de la aplicación.
