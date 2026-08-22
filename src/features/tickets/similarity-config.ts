import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { buildings } from "@/db/schema";

// Configuración de la heurística de duplicados, POR EDIFICIO (paso 7.6) --
// coherente con que findSimilarTickets (paso 7.1) ya filtra por
// building_id. Único lugar del proyecto con estos dos valores "de
// verdad" -- antes de este paso vivían como constantes de módulo:
// `DEFAULT_SIMILAR_TICKETS_WINDOW_HOURS` (72, find-similar-tickets.ts) y
// `DEFAULT_SIMILARITY_THRESHOLD` (0.20, detect-similar-tickets-on-create.ts).
// Ahora son columnas de `buildings` (`similarity_window_hours`/
// `similarity_threshold`), con esos mismos valores como default de
// columna -- ningún edificio existente cambia de comportamiento al
// aplicar la migración.
//
// Los nombres de las constantes de default se mantienen para no romper
// el significado que ya tenían (72h/0.20 documentados en el paso 7.1/7.2)
// -- ahora sirven de: (a) default real de la columna en la migración, y
// (b) fallback defensivo acá si el edificio no resolviera (no debería
// pasar en la práctica: los dos callers reales ya tienen un
// buildingId/organizationId válidos antes de llegar acá).
export const DEFAULT_SIMILARITY_WINDOW_HOURS = 72;
export const DEFAULT_SIMILARITY_THRESHOLD = 0.2;

// Límites de la ventana (horas) -- validados con Zod en
// similarity-settings-schema.ts Y con un CHECK en buildings.ts (defensa en
// profundidad, mismo criterio que el resto del esquema). 1 a 720 (30
// días): no puede ser 0 ni negativa, y un patrón que se repite más
// espaciado que un mes deja de ser "el mismo hecho duplicado" para pasar
// a ser un problema recurrente (que la agrupación manual de la etapa 7 ya
// cubre mejor que seguir ensanchando la ventana).
export const SIMILARITY_WINDOW_HOURS_MIN = 1;
export const SIMILARITY_WINDOW_HOURS_MAX = 720;

// Límites del umbral -- (0, 1], no [0, 1]. CERO bloqueado a propósito:
// similarity() siempre es >= 0, así que un umbral de 0 matchearía
// CUALQUIER ticket del mismo edificio+categoría+ventana (inunda de falsos
// positivos, rompe el propósito de la heurística). UNO permitido a
// propósito, aunque sea un extremo: sigue siendo una elección válida y no
// degenerada (solo flaggear texto prácticamente idéntico), a diferencia
// de 0.
export const SIMILARITY_THRESHOLD_MIN_EXCLUSIVE = 0;
export const SIMILARITY_THRESHOLD_MAX = 1;

export type SimilarityConfig = {
  windowHours: number;
  threshold: number;
};

// Único lugar que lee estos dos valores de la base -- llamado desde
// findSimilarTickets() (para windowHours) y desde
// detectAndFlagSimilarTickets() (para threshold), cada uno usando solo el
// campo que le corresponde a su propia responsabilidad (ver el comentario
// de cada call site para por qué no se fusionaron en una sola función que
// hiciera las dos cosas). Un cambio de configuración NUNCA recalcula
// candidatos ya detectados -- esta función solo se llama al DETECTAR
// (paso 7.2, en el alta de un ticket nuevo), nunca contra filas ya
// escritas en ticket_similarity_candidates.
export async function getBuildingSimilarityConfig(
  organizationId: string,
  buildingId: string,
): Promise<SimilarityConfig> {
  const [row] = await db
    .select({
      windowHours: buildings.similarityWindowHours,
      threshold: buildings.similarityThreshold,
    })
    .from(buildings)
    .where(
      and(
        eq(buildings.id, buildingId),
        eq(buildings.organizationId, organizationId),
      ),
    );

  return {
    windowHours: row?.windowHours ?? DEFAULT_SIMILARITY_WINDOW_HOURS,
    threshold: row?.threshold ?? DEFAULT_SIMILARITY_THRESHOLD,
  };
}
