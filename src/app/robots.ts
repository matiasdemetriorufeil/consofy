import type { MetadataRoute } from "next";

import { env } from "@/lib/env";

// SEO de la superficie pública (Etapa 16, paso 16.4). Hasta el 16.3 esto
// bloqueaba TODO el sitio (`disallow: "/"`) a propósito: no había nada
// público que indexar. Ahora la landing (`/`) es contenido público real
// -- se abre a los buscadores.
//
// Se sigue bloqueando:
//   - `/panel/`: superficie privada (login por delante). "Esperable y
//     correcto" -- antes quedaba cubierto por el `/` global.
//   - `/dev/`: rutas internas (styleguide, previews). Ya bloqueadas en
//     prod por src/app/dev/layout.tsx; acá se listan igual para que sigan
//     fuera de los buscadores.
//
// NO se bloquean `/r/[token]` ni `/s/[token]`: son públicas (sin login) y
// no hay ningún link rastreable hacia ellas (el token no es adivinable),
// así que un crawler no llega igual. No se listan en el sitemap tampoco
// (ver sitemap.ts).
//
// `Sitemap:` apunta al sitemap.ts de este mismo paso. Dominio desde
// NEXT_PUBLIC_APP_URL, nunca hardcodeado.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: ["/panel/", "/dev/"],
    },
    sitemap: new URL("/sitemap.xml", env.NEXT_PUBLIC_APP_URL).toString(),
  };
}
