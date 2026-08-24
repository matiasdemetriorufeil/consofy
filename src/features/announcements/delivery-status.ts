// Traducción de announcement_recipient_delivery_status (paso 8.5) --
// valores en inglés en la base (dato, no UI), mismo criterio que
// occupancy-role.ts para unit_occupancies.role. "link_opened" se traduce
// como "WhatsApp abierto", no "Enviado" -- mismo motivo ya documentado en
// el esquema (src/db/schema/announcement-recipients.ts): es lo único que
// se sabe con certeza que pasó, no una confirmación de entrega real.
export const DELIVERY_STATUS_LABEL = {
  pending: "Pendiente",
  link_opened: "WhatsApp abierto",
  failed: "Falló",
  skipped: "Sin teléfono",
} as const;

export type DeliveryStatus = keyof typeof DELIVERY_STATUS_LABEL;
