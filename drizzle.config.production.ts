import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Config SEPARADO, a propósito, del drizzle.config.ts de todos los días
// (separación dev/producción). El comando de uso diario (`db:migrate`,
// `db:generate`, `db:studio`) usa drizzle.config.ts, que lee `.env.local`
// -- el proyecto de DESARROLLO. Tocar producción con drizzle-kit requiere
// invocar explícitamente los scripts `*:prod` de package.json, que pasan
// `--config=drizzle.config.production.ts` y por lo tanto leen
// `.env.production.local` en vez de `.env.local`.
//
// La protección acá es de NOMBRE, no de código: no hay (ni puede haber)
// una forma de que el comando de todos los días toque producción por
// error, porque directamente no sabe que este archivo existe. Tocar
// producción exige escribir un comando distinto y más largo a propósito
// -- mismo criterio que el candado de project ref de seed.ts (ver ese
// archivo), pero acá no se puede bloquear por completo: a diferencia del
// seed (que NUNCA debe tocar producción), una migración sí necesita llegar
// a producción cada vez que se despliega un cambio de schema.
config({ path: ".env.production.local" });

const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL;

if (!migrationDatabaseUrl) {
  throw new Error(
    "Falta MIGRATION_DATABASE_URL en .env.production.local (pooler de sesión o conexión directa, puerto 5432, del proyecto de PRODUCCIÓN). Ver .env.example.",
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
