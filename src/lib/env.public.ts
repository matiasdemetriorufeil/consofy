import { z } from "zod";

// Separado de env.ts a propósito (ya estaba anotado ahí): env.ts importa
// "server-only", así que no se puede usar desde código de navegador --
// src/lib/supabase/client.ts corre en el browser y necesita estas dos
// variables. Este archivo NO importa "server-only" porque lo consumen los
// dos lados.
//
// Las referencias a process.env.NEXT_PUBLIC_* de acá abajo tienen que quedar
// LITERALES (no `process.env[key]` ni un objeto armado en loop): Next.js
// reemplaza esas referencias por su valor en build time solo cuando puede
// verlas como texto literal en el código fuente, para poder incluirlas en el
// bundle del cliente. Como este módulo se importa desde client.ts, alcanza
// con que la referencia literal esté en ESTE archivo -- el reemplazo de
// Next.js opera sobre todo el grafo de módulos del bundle, no solo el
// archivo de entrada.
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

function parsePublicEnv() {
  if (process.env.SKIP_ENV_VALIDATION === "true") {
    return process.env as unknown as z.infer<typeof schema>;
  }

  const parsed = schema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `Variables de entorno públicas inválidas o faltantes. Revisá .env.local contra .env.example:\n${details}`,
    );
  }

  return parsed.data;
}

export const publicEnv = parsePublicEnv();
