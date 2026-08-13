"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { AuthorizedUser } from "@/lib/auth";

type PanelUserContextValue = Pick<AuthorizedUser, "appUser" | "organization">;

const PanelUserContext = createContext<PanelUserContextValue | null>(null);

// El layout de /panel resuelve requireUser() UNA sola vez (Server
// Component) y lo empuja acá abajo -- así los Client Components del panel
// (nav, header, lo que venga) leen usuario/organización sin volver a
// pedirlos al servidor y sin poder importar requireUser() ellos mismos
// (es server-only). Ver CLAUDE.md > Autorización de rutas y Server
// Actions, y el patrón que documenta Next.js para este caso exacto:
// "Client Components can't import the DAL... pass data to client children
// as props or through a context provider."
export function PanelUserProvider({
  value,
  children,
}: {
  value: PanelUserContextValue;
  children: ReactNode;
}) {
  return (
    <PanelUserContext.Provider value={value}>
      {children}
    </PanelUserContext.Provider>
  );
}

export function usePanelUser(): PanelUserContextValue {
  const value = useContext(PanelUserContext);
  if (!value) {
    throw new Error("usePanelUser debe usarse dentro de PanelUserProvider");
  }
  return value;
}
