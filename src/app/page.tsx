import type { Metadata } from "next";

import { LandingPage } from "@/features/landing/components/landing-page";

// Landing pública (Etapa 16, paso 16.3). Reemplaza el placeholder. Copy
// del 16.1, tokens del 16.2 -- ver CLAUDE.md > Landing page pública.
//
// Metadata mínima propia: sin esto, `/` heredaba el title/description del
// panel del layout raíz. `title.absolute` para NO pasar por el template
// `%s · Consofy` del layout (quedaría "... · Consofy · Consofy"). El SEO
// completo (Open Graph, sitemap) es el 16.4.
export const metadata: Metadata = {
  title: {
    absolute: "Consofy -- los reclamos de tu edificio en un solo lugar",
  },
  description:
    "Consofy le da a cada edificio un link para que los vecinos carguen sus reclamos, y a la administración un panel donde ve todo, cambia estados y no se pierde nada.",
};

export default function Home() {
  return <LandingPage />;
}
