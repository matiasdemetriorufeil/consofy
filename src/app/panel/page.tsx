import { Button } from "@/components/ui/button";
import { logoutAction } from "@/features/auth/actions";
import { requireUser } from "@/lib/auth";

// Placeholder: el panel real (bandeja de reclamos, nav, etc.) es un paso
// futuro. Esta página existe en el paso 3.2 solo para tener un destino real
// donde verificar el flujo de login/logout de punta a punta -- sin esto no
// hay forma de probar en un navegador real que el login redirige a algún
// lado, o que el logout deja de mostrar contenido protegido.
export default async function PanelPage() {
  const { appUser, organization } = await requireUser();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <div>
        <h1 className="text-ink text-2xl font-bold">
          Hola, {appUser.displayName}
        </h1>
        <p className="text-ink-muted">{organization.name}</p>
      </div>
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
