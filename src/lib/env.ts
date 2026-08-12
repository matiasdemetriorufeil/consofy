import "server-only";

import { z } from "zod";

// REGLA: una variable se agrega a este esquema en el mismo paso en que algún
// código empieza a leerla, nunca antes. Hoy lo único que lee una variable de
// entorno de acá es src/db/index.ts (DATABASE_URL). No agregues
// SUPABASE_SERVICE_ROLE_KEY ni MESSAGING_PROVIDER hasta que algo las importe
// de verdad — ver PASO 2.1b en el historial: validar variables que nada
// consume obliga a rellenarlas con dummies para poder probar cualquier otra
// cosa, y eso invalida la validación.
//
// Las NEXT_PUBLIC_* NO van acá: viven en src/lib/env.public.ts, un schema
// aparte sin "server-only" (este archivo sí lo tiene), porque
// src/lib/supabase/client.ts corre en el navegador y necesita leerlas.
//
// MIGRATION_DATABASE_URL no vive acá a propósito: la usa únicamente
// drizzle.config.ts (que la lee directo de process.env, ver ese archivo). No
// es una credencial que la app en runtime necesite para arrancar.

const schema = z.object({
  DATABASE_URL: z.url(),
});

function parseEnv() {
  if (process.env.SKIP_ENV_VALIDATION === "true") {
    // Para CI o builds de análisis que no van a ejecutar la app de verdad
    // (ej: un build que solo corre para chequear tipos, sin acceso a
    // secretos). Nunca en runtime: saltear esto en producción hace arrancar
    // la app sin haber validado nada.
    return process.env as unknown as z.infer<typeof schema>;
  }

  const parsed = schema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
  });

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `Variables de entorno inválidas o faltantes. Revisá .env.local contra .env.example:\n${details}`,
    );
  }

  return parsed.data;
}

export const env = parseEnv();
