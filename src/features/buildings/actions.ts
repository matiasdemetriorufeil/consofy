"use server";

import { cookies } from "next/headers";

import { authorizedAction } from "@/lib/auth";

import { getActiveBuildings } from "./queries";
import { SELECTED_BUILDING_COOKIE } from "./selected-building";

// authorizedAction() (src/lib/auth.ts): cambiar el edificio seleccionado
// es una Server Action invocable por HTTP directo como cualquier otra --
// ver CLAUDE.md > Autorización de rutas y Server Actions. Sin esto,
// cualquiera podría setear la cookie a un uuid arbitrario sin haber
// iniciado sesión.
//
// `buildingId: null` representa "Todos los edificios" -- ver CLAUDE.md >
// Selector de edificio activo.
export const setSelectedBuildingAction = authorizedAction(
  async (context, buildingId: string | null) => {
    const store = await cookies();

    if (buildingId === null) {
      store.delete(SELECTED_BUILDING_COOKIE);
      return;
    }

    // Nunca se confía en el id que mandó el cliente sin cruzarlo: valida
    // que sea uno de los edificios ACTIVOS de la organización de quien
    // está autorizado (no cualquier uuid, no uno de otra organización, no
    // uno dado de baja). Si no es válido, no hace nada -- ni error ni
    // cookie corrupta, la misma lógica de "silenciosamente cae a todos los
    // edificios" que ya aplica resolveSelectedBuilding() en lectura.
    const activeBuildings = await getActiveBuildings(context.organization.id);
    const isValid = activeBuildings.some(
      (building) => building.id === buildingId,
    );
    if (!isValid) {
      return;
    }

    store.set(SELECTED_BUILDING_COOKIE, buildingId, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/panel",
      maxAge: 60 * 60 * 24 * 365,
    });
  },
);
