import {
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { idColumn, timestamps } from "./_shared";
import { announcements } from "./announcements";
import { people } from "./people";

// Nombrados de forma honesta con cómo funciona el envío en Fase 1: no hay
// integración con la API de WhatsApp, el "envío" es el administrador
// abriendo a mano un link wa.me. Por eso NO hay un estado "sent" separado
// de "se abrió el link" -- tenerlos como dos estados distintos sería
// dishonesto: o son sinónimos del mismo evento (duplican el significado) o
// "sent" implicaría una confirmación de entrega real que Fase 1 no tiene
// forma de verificar (WhatsApp no nos avisa si el mensaje llegó). Por eso
// "link_opened" es el estado terminal de éxito: describe exactamente lo
// que sabemos que pasó, ni más ni menos.
export const announcementRecipientDeliveryStatus = pgEnum(
  "announcement_recipient_delivery_status",
  ["pending", "link_opened", "failed", "skipped"],
);

export const announcementRecipients = pgTable(
  "announcement_recipients",
  {
    id: idColumn(),
    // Denormalizado desde announcements.organization_id -- hace posibles
    // las dos FK compuestas de abajo. Ver CLAUDE.md > Integridad entre
    // organizaciones.
    organizationId: uuid("organization_id").notNull(),
    announcementId: uuid("announcement_id").notNull(),
    personId: uuid("person_id").notNull(),
    deliveryStatus: announcementRecipientDeliveryStatus("delivery_status")
      .notNull()
      .default("pending"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    // Nullable: si la persona no tiene teléfono cargado (people.phone_e164
    // es nullable -- ver CLAUDE.md > Acceso a datos), no hay nada que
    // congelar y la fila igual tiene que poder existir con
    // delivery_status = 'skipped' para dejar registro de que se la excluyó
    // y por qué (error_message).
    //
    // Cuando SÍ hay teléfono: se congela acá en vez de resolverse con un
    // JOIN en vivo a people.phone_e164, porque si la persona cambia de
    // número después, el historial tiene que seguir diciendo A DÓNDE se
    // mandó ESE aviso puntual, no a dónde se mandaría hoy. Mismo criterio
    // que ticket_events.actor_label: es un registro histórico, no una
    // vista derivada.
    phoneSnapshot: text("phone_snapshot"),
    ...timestamps(),
  },
  (t) => [
    foreignKey({
      columns: [t.announcementId, t.organizationId],
      foreignColumns: [announcements.id, announcements.organizationId],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.personId, t.organizationId],
      foreignColumns: [people.id, people.organizationId],
    }).onDelete("restrict"),
    // Pedida explícitamente: no se puede agregar dos veces a la misma
    // persona como destinataria del mismo aviso.
    unique("announcement_recipients_announcement_id_person_id_unique").on(
      t.announcementId,
      t.personId,
    ),
    // "Destinatarios pendientes de un aviso".
    index("announcement_recipients_announcement_id_delivery_status_idx").on(
      t.announcementId,
      t.deliveryStatus,
    ),
  ],
).enableRLS();
