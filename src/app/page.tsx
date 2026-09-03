import type { Metadata } from "next";

import { LandingPage } from "@/features/landing/components/landing-page";
import { env } from "@/lib/env";

// Landing pública (Etapa 16). Copy del 16.1, tokens del 16.2, página del
// 16.3. Este paso (16.4) suma el SEO básico: canonical + Open Graph. La
// indexabilidad (robots) y el sitemap viven en src/app/robots.ts y
// src/app/sitemap.ts.
//
// - `title.absolute`: no pasa por el template `%s · Consofy` del layout
//   raíz (quedaría "... · Consofy · Consofy").
// - `metadataBase` desde NEXT_PUBLIC_APP_URL (misma var que public-link.ts,
//   paso 4.6) -- NO se hardcodea el dominio. En dev http://localhost:3000;
//   en prod, lo que tenga Vercel. Resuelve `canonical` y `og:url` de abajo,
//   que van relativos ("/").
// - `lang`/locale: `<html lang="es-AR">` ya está en el layout raíz
//   (confirmado). `og:locale` usa el formato con guion bajo (`es_AR`).
// - `og:image` / `twitter:image`: el card lo genera `opengraph-image.tsx`
//   (convención de Next, decisión del arquitecto: next/og). No hace falta
//   declararlo acá -- Next lo detecta y arma las dos etiquetas. Solo se
//   agrega `twitter` (card + title + description) reusando las constantes.
const TITLE = "Consofy -- los reclamos de tu edificio en un solo lugar";
const DESCRIPTION =
  "Consofy le da a cada edificio un link para que los vecinos carguen sus reclamos, y a la administración un panel donde ve todo, cambia estados y no se pierde nada.";

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    siteName: "Consofy",
    type: "website",
    locale: "es_AR",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function Home() {
  return <LandingPage />;
}
