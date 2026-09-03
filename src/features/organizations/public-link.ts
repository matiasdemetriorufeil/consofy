import "server-only";

import { env } from "@/lib/env";

// Enlace público a nivel de organización (paso 17.2): la misma mecánica que
// getBuildingPublicUrl (src/features/buildings/public-link.ts, paso 4.6),
// pero apuntando a /o/[token] -- la página que le muestra a un vecino la
// lista de edificios activos de la organización para que elija el suyo
// (paso 17.1) -- en vez de /r/[token]. Igual que el enlace de edificio, se
// arma siempre en el servidor (NEXT_PUBLIC_APP_URL vive en el schema de
// servidor, src/lib/env.ts) y se pasa ya resuelto como string a los
// componentes cliente -- ver el comentario de NEXT_PUBLIC_APP_URL en env.ts.
export function getOrganizationPublicUrl(publicToken: string): string {
  return `${env.NEXT_PUBLIC_APP_URL}/o/${publicToken}`;
}
