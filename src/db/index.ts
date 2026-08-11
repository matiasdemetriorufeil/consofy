import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/lib/env";

import * as schema from "./schema";

// El hot reload de "next dev" vuelve a ejecutar este módulo en cada cambio
// de archivo. Sin cachear el cliente en globalThis, cada reload abre una
// conexión nueva al pooler y termina agotándolo.
const globalForDb = globalThis as unknown as {
  queryClient?: postgres.Sql;
};

// prepare: false es obligatorio acá: DATABASE_URL apunta al pooler de
// transacciones de Supabase, que no soporta prepared statements.
const queryClient =
  globalForDb.queryClient ?? postgres(env.DATABASE_URL, { prepare: false });

if (process.env.NODE_ENV !== "production") {
  globalForDb.queryClient = queryClient;
}

export const db = drizzle({ client: queryClient, schema });
