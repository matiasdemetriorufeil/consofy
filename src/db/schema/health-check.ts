import { pgTable, serial } from "drizzle-orm/pg-core";

import { denyAnonAuthenticated } from "./_shared";

// Canario de conexión: no es una entidad de negocio, por eso no sigue la
// convención de id uuid + created_at/updated_at del resto de las tablas.
export const healthCheck = pgTable(
  "health_check",
  {
    id: serial("id").primaryKey(),
  },
  () => [denyAnonAuthenticated()],
).enableRLS();
