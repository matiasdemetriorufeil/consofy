import "server-only";

import { z } from "zod";

// REGLA: una variable se agrega a este esquema en el mismo paso en que algún
// código empieza a leerla, nunca antes. Hoy lo único que lee una variable de
// entorno es src/db/index.ts (DATABASE_URL). No agregues acá
// SUPABASE_SERVICE_ROLE_KEY, MESSAGING_PROVIDER ni las NEXT_PUBLIC_* hasta
// que algo las importe de verdad — ver PASO 2.1b en el historial: validar
// variables que nada consume obliga a rellenarlas con dummies para poder
// probar cualquier otra cosa, y eso invalida la validación.
//
// Cuando aparezca la primera NEXT_PUBLIC_*, va en un schema aparte: Next.js
// solo reemplaza process.env.NEXT_PUBLIC_* en el bundle del cliente cuando la
// referencia es literal, así que cada variable pública se lee explícita, no
// armada dinámicamente.
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
