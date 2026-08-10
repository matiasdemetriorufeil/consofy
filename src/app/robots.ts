import type { MetadataRoute } from "next";

// TODO: revisar antes del lanzamiento real. Por ahora no hay nada público
// para indexar (ni el formulario de reclamos existe todavía), así que se
// bloquea todo el sitio. /dev/ queda listado aparte a propósito: cuando se
// abra el resto del sitio a los buscadores, /dev/ tiene que seguir bloqueado.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: ["/", "/dev/"],
    },
  };
}
