import path from "node:path";

import dotenv from "dotenv";

// Carga `.env.local` (proyecto de DESARROLLO -- ver CLAUDE.md > Separación
// dev/producción). Se importa primero desde cada helper que necesite
// DATABASE_URL / claves de Supabase, porque los workers de Playwright son
// procesos aparte del que evaluó `playwright.config.ts`. `dotenv.config`
// no pisa una variable ya definida, así que llamarlo de más es inofensivo.
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name} -- ¿está en .env.local? (ver CLAUDE.md > Separación dev/producción)`,
    );
  }
  return value;
}
