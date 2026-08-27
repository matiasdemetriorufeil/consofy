import type { notificationType } from "@/db/schema/notifications";

export type NotificationType = (typeof notificationType.enumValues)[number];

// Mismo criterio que OCCUPANCY_ROLE_LABEL (people/occupancy-role.ts) -- un
// mapa chico, sin lógica. Ampliado en la corrección de 9.4 (ver CLAUDE.md >
// Generación automática de notificaciones) a los 3 types nuevos.
//
// `urgent_ticket`/`incident_multi_unit` tienen su PROPIO label, distinto
// del de su "hermana" (`new_ticket`/`incident_updated`) -- cambio pedido
// por la persona en una segunda vuelta sobre este mismo paso: la primera
// versión los hacía compartir texto ("para quien lee el listado, las dos
// siguen siendo un reclamo/un problema en común"), y la persona pidió
// explícitamente que se distingan de un vistazo en la campana, no solo
// leyendo el título completo de cada fila -- ver también
// NOTIFICATION_TYPE_ACCENT más abajo, que les da además un tratamiento de
// color acorde.
export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  new_ticket: "Nuevo reclamo",
  urgent_ticket: "Reclamo urgente",
  ticket_overdue: "Reclamo sin resolver",
  reminder_due: "Vencimiento",
  incident_updated: "Problema en común",
  incident_multi_unit: "Varias unidades",
  system: "Sistema",
};

// Acento de color para el label chico de la campana -- decisión tomada
// CON LA PERSONA (no propia): "urgent_ticket"/"incident_multi_unit"
// tienen que reconocerse de un vistazo, no solo por su texto. Reusa los
// mismos DOS tokens semánticos que ya usan PriorityBadge
// (tickets/components/priority-badge.tsx, paso 6.3) y ReminderUrgencyBadge
// (reminders/components/reminder-urgency-badge.tsx, paso 9.2) -- ningún
// color nuevo, ninguna paleta propia para este widget:
//
// - `urgent_ticket` -> "urgente" (mismo tono que `PriorityBadge`
//   `priority="urgente"`): es, literalmente, un reclamo con
//   `ticketPriority: "urgent"` -- el mismo hecho que ya pinta de ese color
//   en la bandeja de reclamos, ahora también en la campana.
// - `incident_multi_unit` -> "alta" (mismo tono que
//   `ReminderUrgencyBadge` con `urgency="upcoming"`): amerita más
//   atención que un aviso genérico, pero no es una alarma -- mismo
//   criterio de intensidad que "próximo a vencer" en el semáforo de
//   recordatorios, no el rojo de "urgente"/"vencido".
//
// El resto de los types NO lleva acento -- siguen mostrando el label
// chico como texto plano, sin Badge, igual que desde el paso 9.3. Sin
// ícono nuevo por type: mismo criterio ya fijado en 9.3 ("cuatro íconos
// nuevos solo para esto no se justificaban frente a un texto corto") --
// un ícono más para dos types puntuales tendría la misma desproporción,
// el color ya alcanza para "reconocible, no alarmante".
export type NotificationAccent = "urgente" | "alta";

export const NOTIFICATION_TYPE_ACCENT: Partial<
  Record<NotificationType, NotificationAccent>
> = {
  urgent_ticket: "urgente",
  incident_multi_unit: "alta",
};
