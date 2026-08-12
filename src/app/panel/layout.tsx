import { requireUser } from "@/lib/auth";

// force-dynamic explícito además del que ya implica requireUser() (usa
// cookies() por debajo, que de por sí opta la ruta a render dinámico): dejar
// esto explícito documenta la intención -- ninguna ruta bajo /panel se
// prerenderiza ni cachea en build time, siempre se evalúa la sesión en cada
// request. Ver el punto 8 del paso 3.2 sobre no dejar contenido protegido
// visible después de un logout.
export const dynamic = "force-dynamic";

// Protección a nivel de layout, no de cada página: todo lo que cuelgue de
// /panel/* queda cubierto por requireUser() automáticamente, sin depender
// de que cada página nueva se acuerde de llamarlo. cache() (en
// src/lib/auth.ts) evita que esto dispare una query repetida si la página
// hija también llama requireUser() para leer los datos del usuario.
export default async function PanelLayout({ children }: LayoutProps<"/panel">) {
  await requireUser();
  return children;
}
