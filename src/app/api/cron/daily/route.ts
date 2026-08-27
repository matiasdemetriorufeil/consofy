import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { runDailyCron } from "@/features/cron/run-daily-cron";
import { env } from "@/lib/env";

// Endpoint del cron diario (paso 9.6, punto 4) -- Route Handler, no Server
// Action: lo llama un workflow de GitHub Actions (un curl desde fuera de
// la app), no un `<form>` ni un componente de React -- una Server Action
// no es invocable así (necesita el protocolo interno de Next para
// Server Actions, no un POST HTTP simple).
//
// Autorización -- NINGÚN mecanismo existente del proyecto aplicaba acá,
// verificado antes de inventar uno (pedido explícito del enunciado):
// - `requireUser()`/`authorizedAction()` (src/lib/auth.ts) dependen de
//   una sesión de Supabase -- GitHub Actions no tiene ninguna, y no
//   correspondería que la tuviera (esto no es "un administrador
//   operando el panel", es un proceso automático).
// - `SUPABASE_SERVICE_ROLE_KEY` es una credencial de Postgres/Supabase,
//   no un mecanismo de autenticación HTTP para UN endpoint propio de
//   esta app -- usarla acá sería forzar una credencial ajena a un
//   propósito para el que no es.
// Por eso: un secreto compartido nuevo (`CRON_SECRET`, ver
// src/lib/env.ts), mandado como `Authorization: Bearer <secreto>` --
// mismo esquema que ya usa Vercel Cron para proteger sus propios cron
// jobs (no estamos usando Vercel Cron, pero el esquema Bearer es
// standard y GitHub Actions lo manda con un simple header en el curl).
// Comparación con `timingSafeEqual` (no `===`) -- un endpoint de
// autorización por secreto compartido es exactamente el caso en el que
// un ataque de timing (medir cuánto tarda la comparación para inferir el
// secreto carácter a carácter) es una amenaza real, aunque de bajo
// riesgo práctico acá; es una línea más, no cuesta nada evitarlo.
function isAuthorized(request: Request): boolean {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return false;
  }
  const provided = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(env.CRON_SECRET);
  // timingSafeEqual exige buffers del MISMO largo -- si no coinciden,
  // ya sabemos que no matchea, sin arriesgar la excepción que tiraría
  // llamarlo con largos distintos.
  if (provided.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(provided, expected);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const result = await runDailyCron();
    return NextResponse.json(result);
  } catch (error) {
    // No debería llegar acá -- runDailyCron() ya aísla cada tarea de
    // cada organización en su propio try/catch (ver ese archivo). Esto
    // cubre igual algo catastrófico ANTES de esa aislación (ej. la base
    // no responde ni para listar las organizaciones activas) -- el
    // workflow de GitHub Actions ve un 500 real en vez de un timeout
    // silencioso.
    console.error("[POST /api/cron/daily] Falló la corrida completa:", error);
    return NextResponse.json(
      { error: "Falló la corrida del cron." },
      { status: 500 },
    );
  }
}
