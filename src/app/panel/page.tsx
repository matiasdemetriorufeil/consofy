import { Button } from "@/components/ui/button";
import { logoutAction } from "@/features/auth/actions";
import { PanelGreeting } from "@/features/auth/components/panel-greeting";

// Placeholder: el panel real (bandeja de reclamos, nav, etc.) es un paso
// futuro. Esta página existe desde el paso 3.2 solo para tener un destino
// real donde verificar el flujo de login/logout de punta a punta -- sin
// esto no hay forma de probar en un navegador real que el login redirige a
// algún lado, o que el logout deja de mostrar contenido protegido.
//
// Ya no llama a requireUser() acá: el layout de /panel (padre) ya lo hizo
// y empujó el resultado al contexto de PanelGreeting -- ver
// panel-user-context.tsx.
export default function PanelPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <PanelGreeting />
      <p className="text-ink-muted max-w-sm text-sm">
        Placeholder del panel — se reemplaza por el panel real en un paso
        futuro.
      </p>
      <form action={logoutAction}>
        <Button type="submit" variant="outline">
          Cerrar sesión
        </Button>
      </form>
    </main>
  );
}
