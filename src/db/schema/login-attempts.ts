import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { denyAnonAuthenticated, idColumn } from "./_shared";

// Registro de intentos de login, para el rate limiting del paso 3.2 (ver el
// razonamiento completo en src/features/auth/login-rate-limit.ts). Sin
// organization_id ni FK a nada: un intento de login pasa ANTES de saber
// quién es el usuario o a qué organización pertenece (incluso puede ser un
// email que no existe) -- no hay ninguna entidad de negocio que referenciar
// todavía, mismo motivo que ticket_code_counters no lleva organization_id.
//
// Sin updated_at ni deleted_at: cada fila es un evento inmutable (append-
// only, como ticket_events), nunca se edita ni se borra lógicamente. Si el
// volumen crece con el tiempo, purgar filas viejas (ej. > 24hs) es una
// limpieza operativa futura, no borrado lógico de negocio -- no está
// implementada todavía porque el volumen esperado (login de un puñado de
// administradores) la hace innecesaria por ahora.
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: idColumn(),
    // Normalizado (trim + lowercase) por la aplicación antes de insertar --
    // mismo motivo que people.email, pero acá no hay un CHECK de base
    // forzándolo: a diferencia de people.email (una persona real que ya
    // existe), acá el email puede no corresponder a ninguna cuenta real
    // (alguien probando si existe tal cuenta), así que no tiene sentido
    // validarlo contra ninguna tabla.
    email: text("email").notNull(),
    // IP del request (de x-forwarded-for/x-real-ip -- ver getClientIp() en
    // login-rate-limit.ts). No es un dato sensible per se, pero solo se usa
    // acá para el conteo de intentos, nunca se expone.
    ip: text("ip").notNull(),
    succeeded: boolean("succeeded").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // "¿Cuántos intentos fallidos tuvo este email en los últimos N
    // minutos?" -- WHERE email = ? AND created_at > ?, filtrando succeeded
    // en el scan (booleano, no vale la pena como columna líder del índice).
    index("login_attempts_email_created_at_idx").on(t.email, t.createdAt),
    // Mismo criterio, por IP.
    index("login_attempts_ip_created_at_idx").on(t.ip, t.createdAt),
    denyAnonAuthenticated(),
  ],
).enableRLS();
