import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { idColumn, timestamps } from "./_shared";
import { organizations } from "./organizations";

// Valores en inglés (dato de base, no UI) -- ver CLAUDE.md > Glosario. El
// orden de declaración importa acá: Postgres compara enums nativos por
// orden de creación, así que "low" < "medium" < "high" < "urgent" ya
// funciona para ordenar por severidad sin necesitar una columna numérica
// aparte.
export const ticketPriority = pgEnum("ticket_priority", [
  "low",
  "medium",
  "high",
  "urgent",
]);

export const categories = pgTable(
  "categories",
  {
    id: idColumn(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    // Nombre de ícono de lucide-react (ej. "wrench"), no el ícono en sí --
    // se resuelve a un componente en la capa de presentación.
    icon: text("icon").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    // Prioridad sugerida al elegir esta categoría en el formulario --
    // punto de partida editable, no un valor fijo del reclamo.
    defaultPriority: ticketPriority("default_priority").notNull(),
    // Distinto de deleted_at a propósito: "active" es un toggle reversible
    // y frecuente ("ocultar esta categoría del formulario sin borrarla")
    // que el administrador prende/apaga desde la config; deleted_at es la
    // baja lógica real (papelera). Esto NO es el antipatrón de "estados
    // derivados" que señala CLAUDE.md > Acceso a datos para
    // unit_occupancies.active -- ahí "active" hubiera guardado el mismo
    // estado que ended_on IS NULL por duplicado. Acá son dos ejes
    // independientes: una categoría borrada siempre está oculta (deleted_at
    // implica inactiva de hecho), pero inactiva-y-no-borrada es un estado
    // real y distinto de activa-y-no-borrada, con su propio significado de
    // negocio.
    active: boolean("active").notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    // Necesaria para que tickets pueda referenciar
    // categories(id, organization_id) con una FK compuesta. Ver CLAUDE.md >
    // Integridad entre organizaciones.
    unique("categories_id_organization_id_unique").on(t.id, t.organizationId),
    // Único dentro de la organización entre categorías NO borradas
    // (parcial, WHERE deleted_at IS NULL): mismo patrón que buildings.slug
    // -- una categoría dada de baja no debe bloquear reutilizar su nombre.
    uniqueIndex("categories_organization_id_name_unique")
      .on(t.organizationId, t.name)
      .where(sql`${t.deletedAt} is null`),
  ],
).enableRLS();
