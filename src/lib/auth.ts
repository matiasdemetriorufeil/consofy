import "server-only";

import type { User } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";

import { db } from "@/db";
import { appUsers, organizations } from "@/db/schema";

import { createClient } from "./supabase/server";

export type Session = {
  user: User;
};

// getUser(), no getSession() de supabase-js (a pesar del nombre de ESTA
// función, que sigue el pedido del paso): supabase.auth.getSession() lee la
// sesión de la cookie sin revalidarla contra el servidor de Auth -- si la
// cookie fue manipulada o el usuario fue baneado/borrado después de
// emitido el JWT, getSession() no se entera. getUser() hace el round-trip
// real a Supabase en cada llamada, que es el costo correcto de pagar acá:
// esta función es la base de toda decisión de autorización del proyecto
// (ver requireUser() abajo), no el refresco de rutina de cada request que
// ya hace src/proxy.ts con getClaims() (ese sí puede ser liviano, porque
// corre en cada request; este se llama mucho menos seguido).
//
// cache() de React: memoiza por request -- si dos Server Components de la
// misma página llaman getSession() (directo o vía requireUser()), la
// segunda llamada no repite el round-trip a Supabase.
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return null;
  }

  return { user: data.user };
});

export type AuthorizedUser = {
  user: User;
  appUser: {
    id: string;
    displayName: string;
    role: (typeof appUsers.$inferSelect)["role"];
  };
  organization: {
    id: string;
    name: string;
    timezone: string;
  };
};

// Un usuario "autorizado" es sesión de Supabase + fila en app_users
// resuelta en la misma consulta (join), nunca una sin la otra -- ver
// AuthorizedUser abajo. Privada: las dos funciones públicas de este
// archivo (requireUser, getAuthorizedUser) se arman sobre esta, difieren
// solo en qué hacen cuando NO hay usuario autorizado.
async function resolveAuthorizedUser(): Promise<AuthorizedUser | null> {
  const session = await getSession();
  if (!session) {
    return null;
  }

  const [row] = await db
    .select({
      appUserId: appUsers.id,
      displayName: appUsers.displayName,
      role: appUsers.role,
      organizationId: organizations.id,
      organizationName: organizations.name,
      organizationTimezone: organizations.timezone,
    })
    .from(appUsers)
    .innerJoin(organizations, eq(appUsers.organizationId, organizations.id))
    .where(eq(appUsers.id, session.user.id));

  if (!row) {
    return null;
  }

  return {
    user: session.user,
    appUser: {
      id: row.appUserId,
      displayName: row.displayName,
      role: row.role,
    },
    organization: {
      id: row.organizationId,
      name: row.organizationName,
      timezone: row.organizationTimezone,
    },
  };
}

// Esta función es la base de toda la autorización del proyecto -- diseñada
// para que sea imposible de usar mal: el único tipo de retorno que existe
// (AuthorizedUser) siempre trae el usuario Y su organización juntos, nunca
// uno sin el otro. No hay una función "getUser()" exportada que devuelva
// el usuario solo -- si hiciera falta, sería un atajo que invita a un bug
// real: código que verifica "hay usuario" pero se olvida de filtrar por
// organización antes de tocar datos.
//
// Redirige a /login en dos casos, no solo uno: sin sesión de Supabase
// (nadie logueado), y CON sesión de Supabase pero sin fila en app_users
// (un usuario de auth.users que existe pero nunca se vinculó a una
// organización -- ver la nota sobre la falta de FK a auth.users en
// app-users.ts). El segundo caso no debería pasar en el flujo normal, pero
// tratarlo igual que "no hay sesión" es la opción segura: no hay
// autorización posible sin organización.
export const requireUser = cache(async (): Promise<AuthorizedUser> => {
  const authorized = await resolveAuthorizedUser();
  if (!authorized) {
    redirect("/login");
  }
  return authorized;
});

// Variante sin redirect, para la página de /login: necesita saber "¿ya hay
// una sesión completamente autorizada?" para mandar directo al panel, pero
// SIN poder usar requireUser() ahí -- si lo usara, una sesión de Supabase
// válida sin fila en app_users (ver el comentario de arriba) generaría un
// loop infinito de redirects entre /login y /panel (login manda a panel
// por tener sesión, panel manda de vuelta a login por no tener app_users,
// login vuelve a mandar a panel...). Con esta variante, ese caso borde cae
// en "no autorizado" sin redirigir -- la página de login simplemente se
// muestra igual.
export const getAuthorizedUser = cache(
  async (): Promise<AuthorizedUser | null> => {
    return resolveAuthorizedUser();
  },
);

// Por qué hace falta esto ADEMÁS del layout de /panel: ver CLAUDE.md >
// Autorización de rutas y Server Actions. Resumen -- una Server Action es
// un endpoint POST invocable por HTTP directo, sin pasar por el layout de
// la ruta desde la que se la llama en la UI. El layout protege la
// navegación normal; esto protege la Server Action en sí, sin importar
// desde dónde se invoque.
//
// Ergonomía: envuelve la action para que reciba el contexto autorizado
// como PRIMER argumento, en vez de llamar a requireUser() suelto adentro
// del cuerpo. La diferencia es deliberada -- "suelto adentro" compila y
// funciona igual si no te olvidás de ponerlo, pero es indistinguible a
// simple vista de una action que se olvidó. Con el contexto como
// argumento, la firma sola ya dice si la action está protegida: una que
// no lo recibe, por construcción, no llama a requireUser().
export function authorizedAction<Args extends unknown[], Result>(
  action: (context: AuthorizedUser, ...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result> {
  return async (...args: Args) => {
    const context = await requireUser();
    return action(context, ...args);
  };
}
