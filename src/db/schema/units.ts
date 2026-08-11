import { sql } from "drizzle-orm";
import { pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { idColumn, timestamps } from "./_shared";
import { buildings } from "./buildings";

export const unitType = pgEnum("unit_type", [
  "departamento",
  "cochera",
  "baulera",
  "local",
  "otro",
]);

export const units = pgTable(
  "units",
  {
    id: idColumn(),
    buildingId: uuid("building_id")
      .notNull()
      .references(() => buildings.id, { onDelete: "restrict" }),
    // Nullable a propósito: muchos edificios no tienen torres.
    tower: text("tower"),
    // Texto, no integer: "PB", "EP", "Subsuelo 1" son pisos válidos y
    // habituales, no solo números.
    floor: text("floor").notNull(),
    number: text("number").notNull(),
    type: unitType("type").notNull(),
    ...timestamps(),
  },
  (t) => [
    // NULL != NULL en SQL: un índice único común sobre (building_id, tower,
    // floor, number) no bloquea dos filas con tower NULL en el mismo piso y
    // número. coalesce(tower, '') normaliza NULL a un valor concreto para
    // que el índice sí las trate como duplicadas. '' es un valor seguro acá
    // porque tower nunca es un string vacío (o es NULL, o un nombre real).
    uniqueIndex("units_building_tower_floor_number_unique").on(
      t.buildingId,
      sql`coalesce(${t.tower}, '')`,
      t.floor,
      t.number,
    ),
  ],
).enableRLS();
