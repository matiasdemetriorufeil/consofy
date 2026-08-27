import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { appUsers } from "@/db/schema";

// A quién avisar por email dentro de una organización -- TODOS sus
// app_users, no "el primero" ni "el más viejo". `app_users.role` solo
// tiene un valor hoy ("admin", ver app-users.ts), así que cualquier fila
// de la organización es, en los hechos, un administrador -- no hay
// ninguna señal en el esquema para elegir uno solo entre varios sin
// inventar un criterio que nadie pidió. En desarrollo esto es siempre 0 o
// 1 fila (ver seed.ts), pero la función no asume eso: si una organización
// real llega a tener más de un administrador, todos reciben el resumen
// diario y las alertas de reclamo urgente -- perderse un aviso real es
// peor que recibir uno de más.
export async function getAdminEmails(
  organizationId: string,
): Promise<string[]> {
  const rows = await db
    .select({ email: appUsers.email })
    .from(appUsers)
    .where(eq(appUsers.organizationId, organizationId));

  return rows.map((r) => r.email);
}
