import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  real,
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
    // Detección de posibles duplicados (paso 7.6) -- POR EDIFICIO, no
    // global, coherente con que findSimilarTickets (paso 7.1) ya filtra
    // por building_id: dos edificios pueden tener volúmenes/patrones de
    // reclamos muy distintos, así que la MISMA sensibilidad no
    // necesariamente le sirve a los dos. Antes de este paso, los dos
    // valores vivían hardcodeados como constantes de módulo --
    // `DEFAULT_SIMILAR_TICKETS_WINDOW_HOURS` (72,
    // find-similar-tickets.ts, paso 7.1) y `DEFAULT_SIMILARITY_THRESHOLD`
    // (0.20, detect-similar-tickets-on-create.ts, paso 7.2) -- ver
    // src/features/tickets/similarity-config.ts para dónde viven ahora
    // esos mismos valores como default de columna (no se cambia el
    // comportamiento de ningún edificio existente al migrar).
    //
    // Un cambio acá NO recalcula candidatos ya detectados (agrupados,
    // descartados o pendientes) -- decisión explícita del enunciado: solo
    // afecta la PRÓXIMA detección, la que corra cuando se cargue el
    // próximo ticket. `ticket_similarity_candidates` no tiene ninguna
    // referencia a estos valores ni una columna "con qué config se
    // detectó esto" -- no hace falta, un candidato ya escrito no se
    // vuelve a evaluar nunca.
    //
    // Ventana en horas -- entero, no un intervalo de Postgres: se usa tal
    // cual en una multiplicación (`windowHours * 3600`, ver
    // find-similar-tickets.ts) del lado de la aplicación, no en SQL
    // directo, así que no hay ninguna ventaja en un tipo INTERVAL acá.
    similarityWindowHours: integer("similarity_window_hours")
      .notNull()
      .default(72),
    // real (float4), mismo tipo que ticket_similarity_candidates.similarity
    // (la salida cruda de pg_trgm similarity()) -- comparar un umbral
    // contra ese valor con el mismo tipo evita cualquier fricción de
    // conversión.
    similarityThreshold: real("similarity_threshold").notNull().default(0.2),
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
    // Paso 7.6 -- mismos rangos que valida similarity-settings-schema.ts
    // del lado de la aplicación (Zod), acá como defensa en profundidad
    // (mismo criterio que ticket_similarity_candidates_similarity_range).
    // 1 a 720 horas (30 días): no puede ser 0 ni negativa (una ventana de
    // cero horas no compara contra nada), y un tope de 30 días porque un
    // patrón que se repite más espaciado que eso deja de ser "el mismo
    // hecho duplicado" para pasar a ser un problema recurrente (que ya
    // cubre mejor la agrupación manual de la etapa 7, no una ventana de
    // similitud cada vez más ancha).
    check(
      "buildings_similarity_window_hours_range",
      sql`${t.similarityWindowHours} >= 1 and ${t.similarityWindowHours} <= 720`,
    ),
    // (0, 1] -- CERO bloqueado a propósito (similarity() siempre es >= 0,
    // así que un umbral de 0 matchearía CUALQUIER ticket del mismo
    // edificio+categoría+ventana, inundando la detección de falsos
    // positivos sin aportar nada). UNO permitido a propósito, aunque sea
    // un extremo: es una elección válida y no degenerada para un
    // administrador que solo quiera flaggear texto prácticamente idéntico
    // (copy-paste), a diferencia de 0 que rompe el propósito completo de
    // la heurística.
    check(
      "buildings_similarity_threshold_range",
      sql`${t.similarityThreshold} > 0 and ${t.similarityThreshold} <= 1`,
    ),
    denyAnonAuthenticated(),
  ],
).enableRLS();
