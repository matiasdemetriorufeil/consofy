import "server-only";

import { z } from "zod";

// REGLA: una variable se agrega a este esquema en el mismo paso en que algún
// código empieza a leerla, nunca antes. Hoy lo leen src/db/index.ts
// (DATABASE_URL) y src/features/buildings/public-link.ts
// (NEXT_PUBLIC_APP_URL, paso 4.6). No agregues SUPABASE_SERVICE_ROLE_KEY ni
// MESSAGING_PROVIDER hasta que algo las importe de verdad — ver PASO 2.1b en
// el historial: validar variables que nada consume obliga a rellenarlas con
// dummies para poder probar cualquier otra cosa, y eso invalida la
// validación.
//
// NEXT_PUBLIC_APP_URL vive ACÁ (esquema de servidor) y no en
// src/lib/env.public.ts a propósito: el enlace público del edificio se arma
// siempre en el servidor (Server Component / Route Handler, nunca en
// código de navegador) y se le pasa a los componentes cliente ya armado
// como string -- no hace falta que el navegador lea esta variable por su
// cuenta. El prefijo NEXT_PUBLIC_ del nombre viene de .env.example (así se
// llama la URL pública base de la app, más allá de quién la lea); ese
// prefijo solo cambia algo para el bundling de Next.js cuando la
// referencia literal `process.env.NEXT_PUBLIC_*` vive en un archivo que
// termina en el bundle del cliente, que no es el caso acá.
//
// Las demás NEXT_PUBLIC_* (Supabase) siguen en src/lib/env.public.ts, un
// schema aparte sin "server-only" (este archivo sí lo tiene), porque
// src/lib/supabase/client.ts corre en el navegador y necesita leerlas ahí.
//
// MIGRATION_DATABASE_URL no vive acá a propósito: la usa únicamente
// drizzle.config.ts (que la lee directo de process.env, ver ese archivo). No
// es una credencial que la app en runtime necesite para arrancar.

const schema = z.object({
  DATABASE_URL: z.url(),
  NEXT_PUBLIC_APP_URL: z.url(),
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
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
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
