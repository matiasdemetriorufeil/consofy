import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import { buildings, categories } from "@/db/schema";

export type PublicBuilding = {
  id: string;
  organizationId: string;
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
        organizationId: buildings.organizationId,
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

export type PublicFormCategory = {
  id: string;
  name: string;
};

// Categorías del paso 2 del formulario (paso 5.2). Mismo criterio que
// getActiveBuildings() (CLAUDE.md > Acceso a datos, "selectores que
// alimentan una carga NUEVA"): active = true AND deleted_at IS NULL -- una
// categoría oculta u ordenada por el administrador no debe ofrecerse acá,
// aunque reclamos viejos sigan referenciándola.
//
// organizationId, no buildingId: categories es de organización, no de
// edificio (ver src/db/schema/categories.ts) -- todos los edificios de una
// misma organización comparten el mismo set de categorías.
export const getActiveCategoriesForBuilding = cache(
  async function getActiveCategoriesForBuilding(
    organizationId: string,
  ): Promise<PublicFormCategory[]> {
    return db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(
        and(
          eq(categories.organizationId, organizationId),
          eq(categories.active, true),
          isNull(categories.deletedAt),
        ),
      )
      .orderBy(asc(categories.sortOrder), asc(categories.name));
  },
);

export type TicketCategory = {
  id: string;
  defaultPriority: (typeof categories.$inferSelect)["defaultPriority"];
};

// Validación server-side de la categoría al confirmar un reclamo (paso
// 5.5): a diferencia de getActiveCategoriesForBuilding() (que alimenta el
// PICKER), acá NO se filtra por `active` -- el vecino pudo haber elegido la
// categoría un rato antes de que un administrador la ocultara del picker;
// eso no debería tirar abajo un reclamo ya en curso. `deleted_at IS NULL`
// SÍ se exige: una categoría borrada de verdad no es un destino válido para
// un reclamo NUEVO, sin importar qué haya elegido el cliente. También trae
// `defaultPriority`, que es de donde sale la prioridad real del reclamo
// (paso 5.2: "sin campo de prioridad en el formulario, sale de la
// categoría").
export async function getCategoryForTicket(
  organizationId: string,
  categoryId: string,
): Promise<TicketCategory | null> {
  const [row] = await db
    .select({ id: categories.id, defaultPriority: categories.defaultPriority })
    .from(categories)
    .where(
      and(
        eq(categories.id, categoryId),
        eq(categories.organizationId, organizationId),
        isNull(categories.deletedAt),
      ),
    );

  return row ?? null;
}
