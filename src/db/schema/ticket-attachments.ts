import {
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";

import { denyAnonAuthenticated, idColumn, timestamps } from "./_shared";
import { tickets } from "./tickets";

export const ticketAttachments = pgTable(
  "ticket_attachments",
  {
    id: idColumn(),
    // Denormalizado desde tickets.organization_id -- hace posible la FK
    // compuesta de abajo. No se actualiza a mano nunca (ver CLAUDE.md >
    // Integridad entre organizaciones).
    organizationId: uuid("organization_id").notNull(),
    ticketId: uuid("ticket_id").notNull(),
    // Path dentro del bucket de Supabase Storage, no una URL: las URLs
    // firmadas se generan al servir el archivo (ver CLAUDE.md > Reglas de
    // seguridad, no negociables), nunca se guardan en la base.
    storagePath: text("storage_path").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    originalFilename: text("original_filename").notNull(),
    ...timestamps(),
  },
  (t) => [
    foreignKey({
      columns: [t.ticketId, t.organizationId],
      foreignColumns: [tickets.id, tickets.organizationId],
    }).onDelete("restrict"),
    // "Ver los adjuntos de este reclamo" al abrir su detalle -- no es una
    // de las 4 consultas de bandeja del punto 6, pero es la razón de ser
    // de esta tabla.
    index("ticket_attachments_ticket_id_idx").on(t.ticketId),
    // Sin columna de orden explícito (sort_order): se muestran en orden de
    // carga, que created_at ya da gratis. Agregar un campo de orden manual
    // ahora sería una columna sin ningún camino de escritura real -- no
    // hay pedida ninguna función de reordenar adjuntos a mano.
    denyAnonAuthenticated(),
  ],
).enableRLS();
