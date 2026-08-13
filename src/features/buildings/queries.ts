import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { buildings } from "@/db/schema";

export type ActiveBuildingOption = {
  id: string;
  name: string;
};

export type ManagedBuildingOption = {
  id: string;
  name: string;
  active: boolean;
};

// Primera consulta real de datos del panel -- el patrón que siguen todas
// las que vengan después (ver CLAUDE.md > Acceso a datos): SIEMPRE filtra
// por organización (nunca se confía en que el llamador ya filtró), SIEMPRE
// excluye lo borrado. `organizationId` es un parámetro obligatorio, no
// opcional con un default "traer todo" -- no existe una forma de llamar a
// esta función y obtener edificios de más de una organización.
//
// Para SELECTORES QUE ALIMENTAN UNA CARGA NUEVA: selector de edificio del
// header, categorías del formulario público de reclamos. Filtra por
// `active = true` ADEMÁS de `deleted_at IS NULL` -- ver CLAUDE.md > Acceso
// a datos sobre por qué son dos ejes distintos (uno es "se fue del
// sistema", el otro es "pausado, pero su historial se sigue viendo"). Un
// edificio con contrato de administración terminado (`active = false`)
// sigue existiendo para consultar reclamos viejos, pero no tiene que
// aparecer acá: no se le puede cargar un reclamo NUEVO.
//
// Si necesitás la lista completa para gestión/historial/reportes (que SÍ
// debe incluir los inactivos), usá getManagedBuildings() más abajo, no
// esta.
export async function getActiveBuildings(
  organizationId: string,
): Promise<ActiveBuildingOption[]> {
  return db
    .select({ id: buildings.id, name: buildings.name })
    .from(buildings)
    .where(
      and(
        eq(buildings.organizationId, organizationId),
        eq(buildings.active, true),
        isNull(buildings.deletedAt),
      ),
    )
    .orderBy(asc(buildings.name));
}

// Para LISTADOS DE GESTIÓN, HISTORIAL Y REPORTES: acá SÍ importa poder ver
// un edificio pausado (`active = false`), porque se sigue consultando lo
// que pasó ahí -- solo se excluye lo borrado (`deleted_at`, la papelera).
// Devuelve `active` para que la UI que consuma esto pueda marcar
// visualmente los inactivos en vez de esconderlos (ver CLAUDE.md > Acceso
// a datos).
//
// Si necesitás la lista para un selector que alimenta una carga nueva
// (edificio activo elegible para un reclamo nuevo, por ejemplo), usá
// getActiveBuildings() de arriba, no esta.
export async function getManagedBuildings(
  organizationId: string,
): Promise<ManagedBuildingOption[]> {
  return db
    .select({
      id: buildings.id,
      name: buildings.name,
      active: buildings.active,
    })
    .from(buildings)
    .where(
      and(
        eq(buildings.organizationId, organizationId),
        isNull(buildings.deletedAt),
      ),
    )
    .orderBy(asc(buildings.name));
}
