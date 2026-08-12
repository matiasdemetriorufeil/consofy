import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { publicEnv } from "@/lib/env.public";

// Cliente de servidor, para Server Components, Server Actions y Route
// Handlers. Igual que el de navegador: SOLO Auth, nunca tablas de negocio
// (esas pasan por Drizzle -- ver src/db/index.ts).
//
// No cachear esto en una variable global ni reusar la instancia entre
// requests: cada llamada arma el cliente con las cookies de ESE request en
// particular. Con fluid compute (instancias de servidor reusadas entre
// invocaciones) cachear el cliente filtraría las cookies/sesión de un
// usuario a la siguiente request que reuse la instancia.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll() se llamó desde un Server Component, que no puede
            // escribir cookies (ver la documentación de "cookies" de
            // Next.js). Es seguro ignorarlo acá porque src/proxy.ts ya se
            // encarga de refrescar la sesión y reescribir las cookies en
            // cada request.
          }
        },
      },
    },
  );
}
