import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import { buildings } from "@/db/schema";

export type PublicBuilding = {
  id: string;
  name: string;
  active: boolean;
};

// ÚNICA excepción del proyecto al patrón "organizationId es siempre el
// primer parámetro" (ver CLAUDE.md > Acceso a datos): esta query es la que
// RESUELVE la organización, no una que ya la conoce -- no hay ningún
// `organizationId` que un caller pueda pasar, porque el único dato que
// trae un vecino sin sesión es el token de la URL. `public_token` hace de
// credencial acá (por eso es único de forma GLOBAL, no por organización --
// ver src/db/schema/buildings.ts): conocer el token entero es lo único que
// autoriza a ver este edificio, no pertenecer a ninguna organización.
//
// Filtra `deleted_at IS NULL` en la query misma, no en el caller: un
// edificio dado de baja tiene que comportarse EXACTAMENTE igual que un
// token que nunca existió (pedido explícito del paso 5.1) -- que el propio
// `null` que devuelve esta función no distinga los dos casos es lo que
// hace estructuralmente imposible filtrar ese detalle por error en algún
// lugar más arriba. `active` SÍ se devuelve (no se filtra acá): un
// edificio inactivo es un caso distinto a propósito, con su propia
// pantalla -- ver src/app/r/[token]/page.tsx.
//
// cache() de React: no hay un segundo caller hoy (paso 5.1 es una sola
// page.tsx, sin layout con lógica), pero el paso 5.2 (el formulario) va a
// necesitar resolver el mismo token para las categorías/unidades del
// edificio -- cachear ahora evita un round-trip de más apenas ese paso
// reutilice esta función en la misma request.
export const getBuildingByPublicToken = cache(
  async function getBuildingByPublicToken(
    token: string,
  ): Promise<PublicBuilding | null> {
    const [row] = await db
      .select({
        id: buildings.id,
        name: buildings.name,
        active: buildings.active,
      })
      .from(buildings)
      .where(
        and(eq(buildings.publicToken, token), isNull(buildings.deletedAt)),
      );

    return row ?? null;
  },
);
