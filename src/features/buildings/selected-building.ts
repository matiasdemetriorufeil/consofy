import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { getActiveBuildings, type ActiveBuildingOption } from "./queries";

// Vive en su propio archivo, sin "use server": la Server Action que setea
// esto (src/features/buildings/actions.ts) necesita este nombre, y un
// archivo "use server" solo puede exportar funciones async -- mismo motivo
// que separa LoginState de actions.ts en el feature de auth.
export const SELECTED_BUILDING_COOKIE = "consorfy_selected_building";

// Ver CLAUDE.md > Selector de edificio activo sobre por qué cookie y no
// localStorage/URL/segmento de ruta. Devuelve el valor crudo de la cookie
// tal cual está, sin validar que exista o pertenezca a la organización --
// esa validación es responsabilidad de quien la usa (ver
// resolveSelectedBuilding más abajo), porque solo el llamador tiene la
// lista de edificios activos de ESTA organización contra la que
// comparar.
export async function getSelectedBuildingIdCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(SELECTED_BUILDING_COOKIE)?.value ?? null;
}

// Resuelve el id crudo de la cookie contra la lista real de edificios
// activos de la organización. Cubre, sin casos especiales, qué pasa si el
// edificio seleccionado se dio de baja (deleted_at) o si la cookie quedó
// de otra organización (sesión anterior, dato manipulado a mano): si el id
// no aparece en `buildings`, el resultado es `null` -- exactamente lo
// mismo que "todavía no eligió nada", nunca un error. La próxima vez que
// la persona elija algo en el selector, setSelectedBuildingAction
// sobrescribe la cookie vieja con un valor válido.
export function resolveSelectedBuilding<T extends { id: string }>(
  buildings: T[],
  selectedId: string | null,
): T | null {
  if (!selectedId) {
    return null;
  }
  return buildings.find((building) => building.id === selectedId) ?? null;
}

// Combina las dos funciones de arriba con la lista de edificios activos,
// para cualquier Server Component que necesite saber "¿cuál está elegido
// AHORA?" sin repetir esas tres líneas -- el layout de /panel (header) y el
// dashboard de inicio (paso 3.5) llaman a esto. cache() de React: si los
// dos llaman a esto en la misma request, la segunda llamada no repite el
// trabajo (y getActiveBuildings ya está cacheada aparte, así que tampoco
// duplica esa consulta).
export const getSelectedBuilding = cache(
  async (organizationId: string): Promise<ActiveBuildingOption | null> => {
    const [activeBuildings, selectedId] = await Promise.all([
      getActiveBuildings(organizationId),
      getSelectedBuildingIdCookie(),
    ]);
    return resolveSelectedBuilding(activeBuildings, selectedId);
  },
);
