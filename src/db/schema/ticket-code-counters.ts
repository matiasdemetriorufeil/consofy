import { integer, pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";

import { buildings } from "./buildings";

// Contador atómico para tickets.public_code (ver tickets.ts y la función
// set_ticket_public_code() en la migración 0009). Por (building_id, year):
// el código final es PREFIJO-AÑO-NNNN, donde PREFIJO sale de
// buildings.code_prefix (único dentro de la organización -- ver
// buildings.ts) y NNNN es este contador. Cada edificio numera desde 1 en
// cada año, independiente de los demás.
//
// Deliberadamente SIN organization_id ni FK compuesta, aunque esta tabla sí
// referencia una entidad de negocio (buildings) -- a diferencia de
// unit_occupancies o tickets, acá hay UNA sola entidad referenciada, no
// varias a la vez. La regla de CLAUDE.md > Integridad entre organizaciones
// existe para impedir que una fila mezcle entidades de DOS organizaciones
// distintas cuando referencia más de una a la vez; con una sola FK (a
// buildings) ese riesgo no existe estructuralmente -- una FK simple ya
// garantiza que building_id apunta a un edificio real, sin importar de qué
// organización sea. Agregar organization_id acá sería una columna
// denormalizada sin ningún propósito de integridad real.
//
// Sin id uuid ni timestamps(): no es una entidad de negocio, es un detalle
// de implementación interno que solo escribe el trigger. (building_id,
// year) ya es su clave natural y el mismo target del ON CONFLICT del
// UPSERT -- una PK uuid sería overhead sin beneficio, porque nada la
// referencia por FK.
export const ticketCodeCounters = pgTable(
  "ticket_code_counters",
  {
    buildingId: uuid("building_id")
      .notNull()
      .references(() => buildings.id, { onDelete: "restrict" }),
    year: integer("year").notNull(),
    lastValue: integer("last_value").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.buildingId, t.year] })],
).enableRLS();
