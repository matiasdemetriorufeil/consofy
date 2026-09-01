import {
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { denyAnonAuthenticated, idColumn, timestamps } from "./_shared";
import { buildings } from "./buildings";
import { organizations } from "./organizations";

// private: solo lo ve el administrador. residents: lo ven los vecinos
// (ej. un reglamento interno). No hay un tercer nivel todavía (ej.
// "solo esta unidad") -- no fue pedido y agregar granularidad especulativa
// acá complicaría el modelo sin un caso de uso concreto.
export const documentVisibility = pgEnum("document_visibility", [
  "private",
  "residents",
]);

export const documents = pgTable(
  "documents",
  {
    id: idColumn(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    buildingId: uuid("building_id").notNull(),
    // Texto libre, no FK a una tabla de categorías propia: a diferencia de
    // categories (que necesita default_priority, sort_order, etc. para el
    // flujo de reclamos), acá category es solo una etiqueta para
    // filtrar/agrupar la biblioteca. Si hace falta una lista fija se valida
    // con Zod en la aplicación -- no se modela una tabla nueva para esto
    // ahora, no fue pedida.
    category: text("category").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    // Path dentro del bucket de Supabase Storage, no una URL -- mismo
    // criterio que ticket_attachments.storage_path (ver CLAUDE.md > Reglas
    // de seguridad): las URLs firmadas se generan al servir el archivo.
    storagePath: text("storage_path").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    originalFilename: text("original_filename").notNull(),
    visibility: documentVisibility("visibility").notNull().default("private"),
    // Texto libre, mismo motivo que tickets.assignee: todavía no existe una
    // tabla de usuarios del panel.
    uploadedBy: text("uploaded_by"),
    version: integer("version").notNull().default(1),
    // Autorreferencia: el documento que esta versión reemplaza. Nullable --
    // la primera versión de un documento no reemplaza nada.
    supersedesId: uuid("supersedes_id"),
    ...timestamps(),
  },
  (t) => [
    foreignKey({
      columns: [t.buildingId, t.organizationId],
      foreignColumns: [buildings.id, buildings.organizationId],
    }).onDelete("restrict"),
    // Necesaria para la autorreferencia de supersedes_id de abajo.
    unique("documents_id_organization_id_unique").on(t.id, t.organizationId),
    // FK compuesta AUTORREFERENCIADA: mismo motivo que cualquier otra FK
    // compuesta de este esquema -- sin esto, nada impediría que
    // supersedes_id apunte a un documento de OTRA organización, aunque sea
    // la misma tabla la que se referencia a sí misma. MATCH SIMPLE
    // (nullable) no exige match cuando es NULL, que es el caso normal (la
    // primera versión de un documento).
    foreignKey({
      columns: [t.supersedesId, t.organizationId],
      foreignColumns: [t.id, t.organizationId],
    }).onDelete("restrict"),
    // "Documentos de un edificio filtrados por categoría y visibilidad".
    index("documents_building_id_category_visibility_idx").on(
      t.buildingId,
      t.category,
      t.visibility,
    ),
    // Paso 12.4 (optimización) -- el explorador (paso 10.2,
    // `getDocumentList`) en la vista "Todos los edificios" (sin edificio
    // en el selector del header) filtra solo por `organization_id` +
    // `deleted_at IS NULL` y ordena por `created_at DESC`. Sin edificio, el
    // índice de arriba no aplica y la consulta es un Seq Scan + sort --
    // confirmado con EXPLAIN ANALYZE a volumen. Con un edificio elegido
    // (el caso más común) sigue usando el índice de arriba. Misma forma
    // que `notifications_organization_id_created_at_idx`.
    index("documents_organization_id_created_at_idx").on(
      t.organizationId,
      t.createdAt,
    ),
    denyAnonAuthenticated(),
  ],
).enableRLS();
