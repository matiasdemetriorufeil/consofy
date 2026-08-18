import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit corre como script standalone, fuera del runtime de Next: no
// carga .env.local solo, hay que pedírselo a dotenv acá.
//
// Este config es el de USO DIARIO -- apunta siempre a `.env.local`, el
// proyecto de DESARROLLO (separación dev/producción). Para tocar
// producción con drizzle-kit existe un config aparte,
// drizzle.config.production.ts, invocado solo por los scripts `*:prod` de
// package.json -- nunca por accidente desde acá.
config({ path: ".env.local" });

const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL;

if (!migrationDatabaseUrl) {
  throw new Error(
    "Falta MIGRATION_DATABASE_URL en .env.local (pooler de sesión, puerto 5432). Ver .env.example.",
  );
}

export default defineConfig({
  schema: "./src/db/schema",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: migrationDatabaseUrl,
  },
});
