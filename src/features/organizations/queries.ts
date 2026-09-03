import "server-only";

import { eq } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import { organizations } from "@/db/schema";

// Paso 17.2 -- el public_token de la organización de quien está logueado,
// para mostrar el enlace de /o/[token] (paso 17.1) en el panel.
// requireUser() (src/lib/auth.ts) ya resolvió y validó la organización, pero
// AuthorizedUser solo trae id/name/timezone; sumarle publicToken cargaría
// ese dato en CADA request del panel para algo que hoy usa una sola
// pantalla. Consulta puntual por id, cacheada por request (cache() de
// React, mismo criterio que el resto de queries.ts del proyecto).
// El organizationId SIEMPRE viene del caller (una page vía requireUser()),
// nunca se resuelve acá dentro -- ver CLAUDE.md > Acceso a datos.
export const getOrganizationPublicToken = cache(
  async function getOrganizationPublicToken(
    organizationId: string,
  ): Promise<string | null> {
    const [row] = await db
      .select({ publicToken: organizations.publicToken })
      .from(organizations)
      .where(eq(organizations.id, organizationId));

    return row?.publicToken ?? null;
  },
);
