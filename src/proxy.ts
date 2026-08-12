import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16 renombró el archivo raíz middleware.ts a proxy.ts (y la función
// exportada, de "middleware" a "proxy") -- middleware.ts sigue andando pero
// quedó deprecado. Este proyecto usa Next 16, así que va con el nombre
// vigente. Ver https://nextjs.org/docs/messages/middleware-to-proxy.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
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
