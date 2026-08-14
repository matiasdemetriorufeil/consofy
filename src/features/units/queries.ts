import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { units } from "@/db/schema";

export type BuildingUnitRow = {
  id: string;
  tower: string | null;
  floor: string;
  number: string;
  type: (typeof units.$inferSelect)["type"];
};

// Listado de solo lectura de la pestaña "Unidades" (paso 4.2, punto 3) --
// sin alta ni edición todavía, eso es el paso 4.3. Mismo patrón de
// organización que el resto del proyecto (ver CLAUDE.md > Acceso a datos):
// `organizationId` primero y obligatorio, `buildingId` segundo. `units`
// tiene su propia columna `organization_id` denormalizada (ver
// src/db/schema/units.ts), así que el filtro va directo sobre la tabla, sin
// necesitar un JOIN contra buildings para confirmar la pertenencia.
//
// Sin LIMIT a propósito, a diferencia de getTicketsForBuilding() en
// tickets/queries.ts -- ver el razonamiento completo ahí. Resumen: un
// edificio real puede tener "cientos" de unidades (documentado, no
// hipotético), pero un SELECT de unas pocas columnas por unas pocas
// centenas de filas sigue siendo una sola consulta liviana y una tabla
// perfectamente renderizable de una sola vez; no hay un caso de uso hoy
// (ordenar, filtrar, buscar) que EXIJA paginar todavía -- eso llega con la
// gestión real de unidades (paso 4.3), no con este listado de solo
// lectura.
export async function getUnitsForBuilding(
  organizationId: string,
  buildingId: string,
): Promise<BuildingUnitRow[]> {
  return db
    .select({
      id: units.id,
      tower: units.tower,
      floor: units.floor,
      number: units.number,
      type: units.type,
    })
    .from(units)
    .where(
      and(
        eq(units.organizationId, organizationId),
        eq(units.buildingId, buildingId),
        isNull(units.deletedAt),
      ),
    )
    .orderBy(asc(units.tower), asc(units.floor), asc(units.number));
}
