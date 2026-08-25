// Extraído de reminders-list.tsx en el paso 9.2, cuando apareció el segundo
// consumidor real (UpcomingRemindersList/ReminderCalendar) -- mismo criterio
// de extracción ya usado en el proyecto (`AR_WHATSAPP_*`, `getClientIp`,
// `createSignedAttachmentUrls`): se factoriza recién con el segundo
// consumidor, no antes.
//
// "YYYY-MM-DD" -> "DD/MM/YYYY" sin pasar por Date/timezone -- `due_date` es
// una columna `date` pura (ver el comentario de ReminderListRow en
// queries.ts), así que parsearla con `new Date(...)` y formatearla con un
// timezone arriesgaría correr la fecha un día para adelante o atrás según
// el offset. Partir el string alcanza y es exacto.
export function formatDueDate(dueDate: string): string {
  const [year, month, day] = dueDate.split("-");
  return `${day}/${month}/${year}`;
}
