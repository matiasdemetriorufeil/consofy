import postgres from "postgres";

// Códigos de error SQLSTATE que este proyecto traduce a mensajes en criollo
// en vez de mostrar el error crudo de Postgres -- ver CLAUDE.md > Reglas de
// seguridad. Compartidos entre features/units, features/people y
// features/imports (el tercer consumidor, paso 4.5 entrega 2, es lo que
// motivó extraer esto de people/actions.ts en vez de duplicarlo otra vez).
export const UNIQUE_VIOLATION = "23505";
export const CHECK_VIOLATION = "23514";

// Dentro de db.transaction() (y de una transacción anidada / SAVEPOINT,
// como usa la escritura de la importación CSV), Drizzle envuelve el error
// real de Postgres en un error propio y lo deja en `.cause` -- fuera de una
// transacción, el driver `postgres` tira el PostgresError directo, sin
// envoltorio. Encontrado en la práctica (paso 4.4): sin desenvolver
// `.cause` acá, cualquier traductor de errores dentro de una transacción
// nunca reconocía el constraint y todo caía en el mensaje genérico.
export function unwrapPostgresError(
  error: unknown,
): postgres.PostgresError | null {
  if (error instanceof postgres.PostgresError) {
    return error;
  }
  if (error instanceof Error && error.cause instanceof postgres.PostgresError) {
    return error.cause;
  }
  return null;
}
