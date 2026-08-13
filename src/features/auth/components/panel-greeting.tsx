"use client";

import { usePanelUser } from "../panel-user-context";

// Demuestra el punto 1 del paso 3.3: este Client Component nunca llama a
// requireUser() (no podría, es server-only) ni pide nada al servidor --
// lee usuario y organización directo del contexto que el layout de /panel
// ya resolvió una sola vez.
export function PanelGreeting() {
  const { appUser, organization } = usePanelUser();

  return (
    <div>
      <h1 className="text-ink text-2xl font-bold">
        Hola, {appUser.displayName}
      </h1>
      <p className="text-ink-muted">{organization.name}</p>
    </div>
  );
}
