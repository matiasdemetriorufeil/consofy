import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { publicEnv } from "@/lib/env.public";

// Nombre de archivo "middleware.ts" a propósito (así lo pide este paso),
// aunque Next.js 16 renombró el archivo raíz de middleware.ts a proxy.ts
// (ver src/proxy.ts) -- lo que vive acá es el HELPER que ese proxy invoca en
// cada request, no el punto de entrada de Next en sí. El nombre sigue
// siendo válido para describir qué hace: refresca la sesión de Supabase.
export async function updateSession(
  request: NextRequest,
): Promise<{ response: NextResponse; hasSession: boolean }> {
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
  // getUser() en cada una sería alto). Llamarlo es lo que dispara el
  // refresco del token si está vencido (efecto secundario de leer la
  // sesión), que es lo único que este archivo garantizaba antes. No
  // confundir con supabase.auth.getSession(): esa lee la cookie sin
  // validarla, y Supabase la desaconseja para decisiones de autorización.
  //
  // hasSession (a partir de acá) es un chequeo OPTIMISTA, no la
  // autorización final: solo dice "el JWT es válido", no "existe una fila
  // en app_users para este usuario". Es intencional que este archivo no
  // toque la base -- ver la recomendación oficial de Next.js sobre Proxy
  // ("it's important to only read the session from the cookie... and
  // avoid database checks to prevent performance issues", ya que corre en
  // TODA request que matchee, incluidas las prefetcheadas). La
  // autorización real, contra la base, sigue siendo responsabilidad de
  // requireUser() (src/lib/auth.ts) en el layout de /panel -- este chequeo
  // optimista solo existe para poder armar el redirect con `next=` (ver
  // src/proxy.ts) antes de que el layout entre a jugar.
  const { data } = await supabase.auth.getClaims();

  return { response: supabaseResponse, hasSession: !!data?.claims };
}
