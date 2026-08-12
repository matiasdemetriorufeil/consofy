"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import {
  getClientIp,
  isRateLimited,
  recordLoginAttempt,
} from "./login-rate-limit";
import { loginSchema, type LoginState } from "./login-schema";

// Nunca se llama desde el cliente (ver CLAUDE.md > Reglas de WhatsApp... y en
// general, todo acceso a Auth/datos pasa por el servidor): la contraseña
// viaja del navegador al servidor de Next una sola vez, en el body de esta
// Server Action, y de ahí a Supabase -- nunca hay un cliente de Supabase en
// el navegador involucrado en el login.
export async function loginAction(
  _prevState: LoginState,
  input: unknown,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    // No debería pasar en el uso normal (el cliente ya valida con el mismo
    // esquema antes de llegar acá), pero si pasa -- request manipulado,
    // JS con un bug -- el mensaje es igual de genérico que el de
    // credenciales incorrectas, nunca revela qué campo falló.
    return { error: "El email o la contraseña no coinciden." };
  }
  const { email, password } = parsed.data;

  const ip = await getClientIp();

  if (await isRateLimited(email, ip)) {
    return {
      error: "Demasiados intentos. Esperá unos minutos y volvé a intentar.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  // Se registra el intento pase lo que pase (éxito o fracaso) -- es lo que
  // alimenta el rate limit de la próxima vez.
  await recordLoginAttempt(email, ip, !error);

  if (error) {
    // "invalid_credentials" es el mismo código para "el email no existe" y
    // para "la contraseña está mal" -- Supabase ya no distingue los dos
    // casos en un solo intento, que es justo lo que necesitamos para no
    // revelar cuál de los dos falló (ver el punto 4 del paso). Cualquier
    // otro código (rate limit propio de Supabase, error de red, timeout)
    // es un problema distinto: no es que las credenciales estén mal, es
    // que no se pudo verificar -- msj distinto, invitando a reintentar.
    if (error.code === "invalid_credentials") {
      return { error: "El email o la contraseña no coinciden." };
    }
    return {
      error:
        "No pudimos conectar con el servidor. Probá de nuevo en un momento.",
    };
  }

  // redirect() fuera de cualquier try/catch: tira una excepción especial
  // que Next.js necesita que llegue sin interceptar -- envolverla en un
  // catch genérico la convertiría en un error más.
  redirect("/panel");
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
