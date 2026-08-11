import { z } from "zod";

// Server-only: importar este módulo desde un Client Component rompe en
// tiempo de carga, porque las variables de servidor no llegan al bundle del
// navegador (Next.js solo inlinea las NEXT_PUBLIC_).

const serverSchema = z.object({
  DATABASE_URL: z.string().url(),
  MIGRATION_DATABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  MESSAGING_PROVIDER: z.enum(["console", "manual_link", "cloud_api"]),
});

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

function parseEnv() {
  // Next.js solo reemplaza process.env.NEXT_PUBLIC_* cuando la referencia es
  // literal, por eso cada variable se lee explícita en vez de armar el objeto
  // dinámicamente.
  const server = serverSchema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
    MIGRATION_DATABASE_URL: process.env.MIGRATION_DATABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    MESSAGING_PROVIDER: process.env.MESSAGING_PROVIDER,
  });

  const client = clientSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });

  if (!server.success || !client.success) {
    const issues = [
      ...(server.success ? [] : server.error.issues),
      ...(client.success ? [] : client.error.issues),
    ];
    const details = issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `Variables de entorno inválidas o faltantes. Revisá .env.local contra .env.example:\n${details}`,
    );
  }

  return { ...server.data, ...client.data };
}

export const env = parseEnv();
