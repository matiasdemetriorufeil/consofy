import type { MetadataRoute } from "next";

import { env } from "@/lib/env";

// Sitemap mínimo (Etapa 16, paso 16.4): solo las rutas públicas que tiene
// sentido listar para indexar -- la landing y el login. NO se incluyen:
//   - `/panel/**`: superficie privada (además bloqueada en robots.ts).
//   - `/r/[token]/**`, `/s/[token]/**`: son por-edificio / por-reclamo,
//     detrás de un token no adivinable; no tiene sentido indexarlas ni
//     enumerar cuáles existen (eso sería una decisión de diseño aparte,
//     no la de este paso).
//   - `/dev/**`: interno, bloqueado en prod (src/app/dev/layout.tsx).
//
// La URL base sale de NEXT_PUBLIC_APP_URL -- NO se hardcodea el dominio.
// Misma variable que usa public-link.ts (paso 4.6). `new URL(path, base)`
// normaliza aunque la var venga con o sin barra final.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = env.NEXT_PUBLIC_APP_URL;

  return [
    {
      url: new URL("/", base).toString(),
      changeFrequency: "monthly",
    },
    {
      url: new URL("/login", base).toString(),
      changeFrequency: "yearly",
    },
  ];
}
