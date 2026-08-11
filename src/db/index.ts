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

const queryClient =
  globalForDb.queryClient ??
  postgres(env.DATABASE_URL, {
    // Obligatorio: DATABASE_URL apunta al pooler de transacciones de
    // Supabase, que no soporta prepared statements.
    prepare: false,
    // Supabase recomienda max:1 por instancia serverless cuando ya se pasa
    // por Supavisor (el pooler de transacciones): Supavisor multiplexa las
    // conexiones reales entre todas las instancias, así que cada instancia
    // solo necesita una propia. El default de postgres-js es max:10, que
    // multiplicado por instancias concurrentes de Vercel agota rápido el
    // límite bajo de conexiones del free tier de Supabase.
    max: 1,
    // Cierra la conexión si queda inactiva: en serverless una instancia
    // puede quedar "warm" un rato sin recibir requests, y una conexión
    // abierta sin uso sigue ocupando un lugar en el pool de Supavisor.
    idle_timeout: 20,
    // Default de postgres-js es 30s. Vercel corta la función bastante antes
    // que eso, así que esperar 30s a que conecte solo consume todo el
    // tiempo de ejecución sin dar chance de fallar rápido y loggear algo útil.
    connect_timeout: 10,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.queryClient = queryClient;
}

export const db = drizzle({ client: queryClient, schema });
