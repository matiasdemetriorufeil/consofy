import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit corre como script standalone, fuera del runtime de Next: no
// carga .env.local solo, hay que pedírselo a dotenv acá.
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
