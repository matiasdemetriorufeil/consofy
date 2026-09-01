import "./env";

import postgres from "postgres";

import { requireEnv } from "./env";

// Conexión directa a la base de DESARROLLO para las aserciones contra
// datos reales (tabla `tickets`, `ticket_events`, etc.) y para la limpieza
// -- mismo criterio que el resto del proyecto usó al verificar cada etapa:
// se comprueba contra la base, no solo contra la UI. Se conecta con el rol
// de la app (`DATABASE_URL`), que evade RLS igual que en runtime (ver
// CLAUDE.md > Políticas RLS) -- no hace falta la service-role key para
// esto. `max: 1` y `idle_timeout` para que el proceso pueda terminar sin
// colgar entre corridas.
export const sql = postgres(requireEnv("DATABASE_URL"), {
  prepare: false,
  max: 1,
  idle_timeout: 10,
});

// Cierre explícito -- cada spec lo llama en su `test.afterAll`, y el
// globalTeardown cierra su propia instancia. Sin esto, el pool deja el
// event loop vivo y el worker no termina.
export async function closeDb(): Promise<void> {
  await sql.end({ timeout: 5 });
}

export async function getOrganizationId(): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    select id from organizations where deleted_at is null order by created_at limit 1
  `;
  if (rows.length === 0) {
    throw new Error("No hay ninguna organización en la base de desarrollo");
  }
  return rows[0]!.id;
}

export async function countActiveTickets(): Promise<number> {
  const rows = await sql<{ n: number }[]>`
    select count(*)::int as n from tickets where deleted_at is null
  `;
  return rows[0]!.n;
}
