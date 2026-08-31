import { index, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { denyAnonAuthenticated, idColumn } from "./_shared";

// Registro de intentos contra el formulario público, para el rate limiting
// del paso 5.11 -- mismo patrón exacto que login_attempts (paso 3.2, ver el
// razonamiento completo en src/features/auth/login-rate-limit.ts): una tabla
// de Postgres, no memoria de proceso (no se comparte entre instancias
// serverless de Vercel) ni Redis (infraestructura nueva sin necesidad real,
// Postgres ya la paga el proyecto). Ver src/features/public-form/
// rate-limit.ts para la lógica de conteo y los umbrales.
//
// Una sola tabla para las acciones públicas del mismo formulario/edificio
// (enviar el reclamo, subir un adjunto, y desde el paso 11.1 consultar el
// estado por public_code tipeado a mano), no una tabla casi idéntica por
// cada una -- `kind` las distingue. Los umbrales de cada una son
// independientes (ver rate-limit.ts): contarlas juntas mezclaría "cuántos
// reclamos mandó este teléfono" con "cuántas veces esta IP probó códigos",
// que no tienen por qué compartir presupuesto.
//
// `phone` es NULLABLE: solo tiene sentido para kind = 'ticket_submission'
// (identifica quién manda el reclamo). La subida de un adjunto (kind =
// 'attachment_upload') pasa ANTES de que el vecino termine de escribir su
// teléfono en algunos casos (el paso 3 del formulario -- Fotos -- no
// depende de haber llenado el paso 1 todavía si el vecino navega para
// adelante y atrás), así que esa acción se limita solo por IP, nunca por
// teléfono -- exactamente lo pedido para ese paso. La consulta de estado
// (kind = 'status_lookup', paso 11.1) tampoco tiene teléfono: el vecino
// solo tipea el código, no se identifica -- se limita solo por IP.
//
// Sin `succeeded` (a diferencia de login_attempts): ahí el conteo filtra
// SOLO intentos fallidos, porque un login exitoso no necesita frenarse. Acá
// el volumen en sí (no el resultado) es la señal de abuso -- un script que
// manda 50 reclamos estructuralmente válidos igual es abuso, así que se
// cuenta CADA intento que llega a intentarse, sin importar si terminó bien.
//
// Sin organization_id/building_id: el límite es GLOBAL por ip/teléfono, no
// por edificio -- mismo motivo que login_attempts no lleva organization_id
// (ver el comentario de esa tabla): no hace falta la entidad de negocio para
// la lógica de conteo, y agregarla sin necesidad sería guardar más de lo
// que hace falta (ver CLAUDE.md > Reglas de entorno, datos de prueba, y el
// criterio de minimizar datos ya aplicado en el paso 5.5 para Ley 25.326).
//
// Sin updated_at ni deleted_at: cada fila es un evento inmutable
// (append-only), igual que login_attempts y ticket_events. Purgar filas
// viejas es limpieza operativa futura, no borrado lógico de negocio.
export const publicFormRateLimitKind = pgEnum("public_form_rate_limit_kind", [
  "ticket_submission",
  "attachment_upload",
  "status_lookup",
]);

export const publicFormRateLimitAttempts = pgTable(
  "public_form_rate_limit_attempts",
  {
    id: idColumn(),
    kind: publicFormRateLimitKind("kind").notNull(),
    ip: text("ip").notNull(),
    phone: text("phone"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // "¿Cuántos intentos de ESTE kind tuvo esta IP en los últimos N
    // minutos?" -- WHERE kind = ? AND ip = ? AND created_at > ?.
    index("public_form_rate_limit_attempts_kind_ip_created_at_idx").on(
      t.kind,
      t.ip,
      t.createdAt,
    ),
    // Mismo criterio, por teléfono (solo se consulta para kind =
    // 'ticket_submission', pero el índice no necesita saberlo).
    index("public_form_rate_limit_attempts_kind_phone_created_at_idx").on(
      t.kind,
      t.phone,
      t.createdAt,
    ),
    denyAnonAuthenticated(),
  ],
).enableRLS();
