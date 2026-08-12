import { createBrowserClient } from "@supabase/ssr";

import { publicEnv } from "@/lib/env.public";

// SOLO para Auth (login, logout, sesión) -- ver CLAUDE.md > Acceso a datos:
// "El cliente de Supabase en el navegador se usa SOLO para Auth y Storage,
// nunca para leer ni escribir tablas de negocio." Ese acceso pasa siempre
// por Drizzle, en el servidor, detrás de una Server Action o un Route
// Handler -- nunca por PostgREST desde acá.
export function createClient() {
  return createBrowserClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
