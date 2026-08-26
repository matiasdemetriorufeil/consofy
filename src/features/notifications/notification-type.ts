import type { notificationType } from "@/db/schema/notifications";

export type NotificationType = (typeof notificationType.enumValues)[number];

// Mismo criterio que OCCUPANCY_ROLE_LABEL (people/occupancy-role.ts) -- un
// mapa chico, sin lógica. El enum de la base ya anticipa la etapa 9.4 (que
// todavía no genera ninguna fila real, ver CLAUDE.md > Centro de
// notificaciones, paso 9.3): las cuatro etiquetas cubren el enum completo
// aunque hoy no exista ningún generador real para ninguna de ellas.
export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  new_ticket: "Nuevo reclamo",
  reminder_due: "Vencimiento",
  incident_updated: "Problema en común",
  system: "Sistema",
};
