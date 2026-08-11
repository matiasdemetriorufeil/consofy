import { sql } from "drizzle-orm";
import {
  index,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { idColumn, timestamps } from "./_shared";
import { buildings } from "./buildings";

// Valores en inglés: son datos de base (código), no UI. La traducción vive
// en src/features/buildings/unit-type.ts, siguiendo el glosario de
// CLAUDE.md.
export const unitType = pgEnum("unit_type", [
  "apartment",
  "parking",
  "storage",
  "commercial",
  "other",
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
    //
    // Parcial (WHERE deleted_at IS NULL) por el mismo motivo que en
    // buildings: con borrado lógico, una unidad borrada no puede seguir
    // bloqueando el (piso, número) para una unidad nueva o recreada.
    uniqueIndex("units_building_tower_floor_number_unique")
      .on(t.buildingId, sql`coalesce(${t.tower}, '')`, t.floor, t.number)
      .where(sql`${t.deletedAt} is null`),
    // Mismo razonamiento que buildings_organization_id_idx: el índice de
    // arriba, al ser parcial, no sirve para "listar TODAS las unidades de
    // este edificio" (activas + dadas de baja).
    index("units_building_id_idx").on(t.buildingId),
  ],
).enableRLS();
