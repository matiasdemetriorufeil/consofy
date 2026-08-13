import { getActiveBuildings } from "@/features/buildings/queries";
import { getSelectedBuilding } from "@/features/buildings/selected-building";
import { PanelUserProvider } from "@/features/auth/panel-user-context";
import { Sidebar } from "@/features/panel/components/sidebar";
import { SiteHeader } from "@/features/panel/components/site-header";
import { SkipLink } from "@/features/panel/components/skip-link";
import { requireUser } from "@/lib/auth";

// force-dynamic explícito además del que ya implica requireUser() (usa
// cookies() por debajo, que de por sí opta la ruta a render dinámico): dejar
// esto explícito documenta la intención -- ninguna ruta bajo /panel se
// prerenderiza ni cachea en build time, siempre se evalúa la sesión en cada
// request. Ver el punto 8 del paso 3.2 sobre no dejar contenido protegido
// visible después de un logout.
export const dynamic = "force-dynamic";

// Protección a nivel de layout para la navegación normal: todo lo que
// cuelgue de /panel/* queda cubierto por requireUser() automáticamente,
// sin depender de que cada página nueva se acuerde de llamarlo. cache()
// (en src/lib/auth.ts) evita que esto dispare una query repetida si la
// página hija también llama requireUser() para leer los datos del
// usuario.
//
// IMPORTANTE -- esto NO alcanza para Server Actions ni Route Handlers
// bajo /panel: ver CLAUDE.md > Autorización de rutas y Server Actions.
// Cada Server Action de dominio necesita su propia autorización, envuelta
// con authorizedAction() (src/lib/auth.ts).
//
// El usuario y la organización que ya resolvió requireUser() acá se
// empujan a los hijos vía PanelUserProvider, para que los Client
// Components del panel los lean sin otro round-trip (ver
// panel-user-context.tsx).
export default async function PanelLayout({ children }: LayoutProps<"/panel">) {
  const { appUser, organization } = await requireUser();

  // getActiveBuildings() y getSelectedBuilding() están cacheadas con
  // cache() de React (src/features/buildings/queries.ts y
  // selected-building.ts): esta última internamente vuelve a pedir la
  // lista de edificios activos, pero al estar cacheada no repite la
  // consulta -- un solo round-trip real a la base para las dos cosas. Ver
  // CLAUDE.md > Selector de edificio activo sobre por qué esto nunca puede
  // fallar ni mostrar un edificio de otra organización o dado de baja.
  const [buildings, selectedBuilding] = await Promise.all([
    getActiveBuildings(organization.id),
    getSelectedBuilding(organization.id),
  ]);

  return (
    <PanelUserProvider value={{ appUser, organization }}>
      <SkipLink />
      <div className="min-h-dvh">
        <Sidebar />
        <div className="flex min-h-dvh flex-col md:pl-60">
          <SiteHeader
            buildings={buildings}
            selectedBuildingId={selectedBuilding?.id ?? null}
          />
          <main
            id="main-content"
            tabIndex={-1}
            className="flex-1 px-4 py-6 outline-none md:px-6 md:py-8"
          >
            {children}
          </main>
        </div>
      </div>
    </PanelUserProvider>
  );
}
