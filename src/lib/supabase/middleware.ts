import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { publicEnv } from "@/lib/env.public";

// Nombre de archivo "middleware.ts" a propósito (así lo pide este paso),
// aunque Next.js 16 renombró el archivo raíz de middleware.ts a proxy.ts
// (ver src/proxy.ts) -- lo que vive acá es el HELPER que ese proxy invoca en
// cada request, no el punto de entrada de Next en sí. El nombre sigue
// siendo válido para describir qué hace: refresca la sesión de Supabase.
export async function updateSession(request: NextRequest) {
  // Hay que devolver ESTE objeto de respuesta con sus cookies actualizadas,
  // no uno nuevo creado más abajo: si en el medio se arma un
  // `NextResponse.next()` distinto y se devuelve ese en cambio, las cookies
  // que Supabase haya reescrito (token refrescado) se pierden en silencio y
  // la sesión expira en el navegador aunque el servidor la haya renovado.
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Primero al request (para que el resto de este proxy vea las
          // cookies actualizadas si sigue ejecutando algo después), después
          // se rearma supabaseResponse a partir de ESE request actualizado
          // y recién ahí se copian las cookies al response saliente.
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getClaims() valida el JWT localmente (firma + expiración) contra las
  // claves públicas del proyecto, sin round-trip a los servidores de Auth
  // en cada request -- es el método recomendado hoy para este caso (este
  // proxy corre en toda request que matchee, así que el costo de red de
  // getUser() en cada una sería alto). El resultado en sí no se usa acá
  // todavía: llamarlo es lo que dispara el refresco del token si está
  // vencido (efecto secundario de leer la sesión), que es lo único que
  // este archivo tiene que garantizar. No confundir con
  // supabase.auth.getSession(): esa lee la cookie sin validarla, y
  // Supabase la desaconseja para decisiones de autorización.
  //
  // La redirección a /login cuando no hay sesión NO vive acá: ese
  // criterio es responsabilidad de requireUser() (src/lib/auth.ts),
  // llamado por cada página/layout que lo necesite -- todavía no existen
  // rutas protegidas en src/app/ como para decidir acá con qué prefijo de
  // path proteger, y hacerlo en las dos capas sería lógica duplicada.
  await supabase.auth.getClaims();

  return supabaseResponse;
}
