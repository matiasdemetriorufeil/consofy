import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16 renombró el archivo raíz middleware.ts a proxy.ts (y la función
// exportada, de "middleware" a "proxy") -- middleware.ts sigue andando pero
// quedó deprecado. Este proyecto usa Next 16, así que va con el nombre
// vigente. Ver https://nextjs.org/docs/messages/middleware-to-proxy.
export async function proxy(request: NextRequest) {
  const { response, hasSession } = await updateSession(request);
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/panel")) {
    // Cache-Control: no-store en /panel/*, encontrado con una prueba real
    // en el navegador (paso 3.2, punto 8): sin esto, después de cerrar
    // sesión el botón atrás del navegador restauraba el panel desde el
    // bfcache (back-forward cache) -- una foto en memoria de la página tal
    // como quedó renderizada, que el navegador puede mostrar sin volver a
    // pedirle nada al servidor. `dynamic = "force-dynamic"` (en
    // panel/layout.tsx) evita que Next.js cachee/prerenderice la
    // respuesta del SERVIDOR, pero no le dice nada al NAVEGADOR sobre si
    // puede guardar esa respuesta en bfcache -- son dos cachés distintos.
    // no-store es justamente la señal que hace que Chrome (y el resto)
    // excluyan la página del bfcache, forzando un pedido nuevo al
    // servidor si se vuelve con atrás -- y ese pedido nuevo sí encuentra
    // la sesión cerrada y redirige a /login.
    response.headers.set("Cache-Control", "no-store");

    // Redirect optimista (paso 3.3, punto 6): sin sesión, ni vale la pena
    // dejar que la request siga hasta el layout -- se corta acá, en el
    // único lugar del pipeline que todavía tiene el path exacto que se
    // pidió. Se guarda en `next` para volver ahí después del login, en
    // vez de mandar siempre a la home del panel. No hace falta
    // sanitizeNextPath() (src/lib/safe-redirect.ts) acá: el valor sale del
    // propio request (siempre empieza con "/panel", por el chequeo de
    // arriba), no de un input externo. SÍ se aplica del otro lado -- en
    // loginAction y en /login -- porque ahí `next` ya es un query param
    // que cualquiera pudo escribir a mano en la URL.
    if (!hasSession) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
      const redirectResponse = NextResponse.redirect(loginUrl);
      // Copiar las cookies del response original: updateSession() puede
      // haber refrescado el token de Supabase, y si se descartan acá esa
      // renovación se pierde en silencio (mismo cuidado que ya toma
      // updateSession() con supabaseResponse).
      response.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie);
      });
      return redirectResponse;
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Todo excepto: assets estáticos, optimización de imágenes de Next,
    // favicon, y archivos de imagen servidos directo desde /public. Sin
    // esto, el proxy corre también sobre esos paths y cada uno dispara una
    // llamada a Supabase para nada -- además de que un bug futuro en la
    // lógica de sesión podría bloquear el propio CSS/JS/imágenes del sitio.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
