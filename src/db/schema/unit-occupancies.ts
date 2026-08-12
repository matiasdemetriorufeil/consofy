import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { idColumn, timestamps } from "./_shared";
import { people } from "./people";
import { units } from "./units";

// Valores en inglés: son datos de base. La traducción vive en
// src/features/people/occupancy-role.ts.
export const occupancyRole = pgEnum("occupancy_role", ["owner", "tenant"]);

export const unitOccupancies = pgTable(
  "unit_occupancies",
  {
    id: idColumn(),
    // Denormalizado desde units.organization_id (y coincide con
    // people.organization_id: las dos FK compuestas de abajo lo exigen).
    // No se actualiza a mano nunca -- ver CLAUDE.md > Integridad entre
    // organizaciones.
    organizationId: uuid("organization_id").notNull(),
    unitId: uuid("unit_id").notNull(),
    personId: uuid("person_id").notNull(),
    role: occupancyRole("role").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    // date, no timestamp: importa el día, no la hora, y evita líos de huso
    // horario en un dato que en la práctica se carga por mes/año.
    startedOn: date("started_on").notNull(),
    // NULL significa ocupación vigente. A propósito NO hay una columna
    // "active": es derivable 100% de ended_on (y de deleted_at para el
    // borrado lógico), y guardar el estado en dos lugares garantiza que en
    // algún update se olviden de sincronizarlos y queden contradichos. Si
    // hace falta consultarlo seguido, se resuelve con una vista o un helper
    // de consulta en la capa de aplicación, no con una columna redundante.
    endedOn: date("ended_on"),
    ...timestamps(),
  },
  (t) => [
    // Dos FK compuestas: la unidad y la persona de una ocupación tienen que
    // pertenecer las dos a esta misma organización. Es lo que hace
    // imposible -a nivel base, no de aplicación- una ocupación que cruce
    // organizaciones.
    foreignKey({
      columns: [t.unitId, t.organizationId],
      foreignColumns: [units.id, units.organizationId],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.personId, t.organizationId],
      foreignColumns: [people.id, people.organizationId],
    }).onDelete("restrict"),
    // Un solo contacto principal vigente por unidad.
    uniqueIndex("unit_occupancies_primary_per_unit_unique")
      .on(t.unitId)
      .where(
        sql`${t.isPrimary} and ${t.endedOn} is null and ${t.deletedAt} is null`,
      ),
    // Evita que la misma persona tenga dos ocupaciones VIGENTES (ended_on
    // IS NULL) en la misma unidad con el mismo rol. Índice único parcial,
    // no exclusion constraint con btree_gist -- ver la justificación larga
    // en CLAUDE.md > Acceso a datos: alcanza para lo pedido ("vigentes
    // solapadas": dos filas con ended_on NULL para la misma clave siempre
    // se solapan, porque las dos se extienden indefinidamente), es más
    // barato (btree normal, sin extensión nueva) y consistente con el
    // resto del esquema. No cubre el caso más amplio de dos rangos
    // CERRADOS que se solapan en el pasado -- si eso llega a hacer falta,
    // ahí sí se justifica la exclusion constraint.
    uniqueIndex("unit_occupancies_unit_person_role_ongoing_unique")
      .on(t.unitId, t.personId, t.role)
      .where(sql`${t.endedOn} is null and ${t.deletedAt} is null`),
    // "Ver el historial completo de ocupantes de esta unidad" (activos +
    // finalizados): las dos parciales de arriba no sirven para esto.
    index("unit_occupancies_unit_id_idx").on(t.unitId),
    // "Ver todas las unidades que ocupa/ocupó esta persona".
    index("unit_occupancies_person_id_idx").on(t.personId),
    check(
      "unit_occupancies_ended_on_after_started_on",
      sql`${t.endedOn} is null or ${t.endedOn} > ${t.startedOn}`,
    ),
  ],
).enableRLS();
