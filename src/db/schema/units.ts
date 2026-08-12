import { sql } from "drizzle-orm";
import {
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  unique,
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
    // Denormalizado desde buildings.organization_id a propósito: es lo que
    // hace posible la FK compuesta de abajo. No se actualiza a mano nunca
    // (ver CLAUDE.md > Integridad entre organizaciones: la FK compuesta ya
    // impide que se desincronice, no hace falta un trigger).
    organizationId: uuid("organization_id").notNull(),
    buildingId: uuid("building_id").notNull(),
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
    // FK compuesta: exige que building_id Y organization_id coincidan con
    // una fila real de buildings a la vez. Sin esto, nada impide guardar
    // una unidad cuyo organization_id no sea el de su propio edificio.
    foreignKey({
      columns: [t.buildingId, t.organizationId],
      foreignColumns: [buildings.id, buildings.organizationId],
    }).onDelete("restrict"),
    // Necesaria para que unit_occupancies pueda referenciar
    // units(id, organization_id) con una FK compuesta. Mismo motivo que en
    // buildings: redundante para probar que id es único, obligatoria para
    // Postgres.
    unique("units_id_organization_id_unique").on(t.id, t.organizationId),
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
