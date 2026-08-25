// Función pura, sin `import "server-only"` -- mismo criterio que
// `normalize-ticket-text.ts` (paso 7.1)/`derive-affected-parties.ts` (paso
// 7.4): lógica de fecha/urgencia testeable con Vitest sin infraestructura de
// servidor, consumida tanto por el calendario como por la lista de próximos
// vencimientos (paso 9.2).

export type ReminderUrgency = "overdue" | "upcoming" | "ok";

// Umbrales del semáforo (paso 9.2, punto 2 -- decisión de diseño propia,
// documentada acá y en CLAUDE.md > Semáforo de vencimientos, no dejada
// implícita en el código):
//
// - "overdue" (🔴 vencido): due_date ya pasó respecto de "today".
// - "upcoming" (🟡 próximo): due_date cae DENTRO de la ventana de aviso
//   propia de ESE recordatorio (`notice_days`) -- no un número global fijo.
//   `notice_days` ya es el campo que el administrador carga a mano para
//   decir "avisame N días antes" (paso 9.1); reusarlo acá como umbral del
//   semáforo evita inventar una segunda constante que compita con un dato
//   que el propio dominio ya modela para esto exacto.
// - "ok" (🟢 tranquilo): más lejos que la ventana de aviso.
//
// Deliberadamente NO tiene en cuenta `recurrence` ni `status` -- ver
// CLAUDE.md > Semáforo de vencimientos para la razón (señalado en el
// reporte del paso, no resuelto en silencio).
export function getReminderUrgency(
  dueDate: string,
  noticeDays: number,
  today: string,
): ReminderUrgency {
  const diff = daysBetween(today, dueDate);
  if (diff < 0) {
    return "overdue";
  }
  if (diff <= noticeDays) {
    return "upcoming";
  }
  return "ok";
}

// Diferencia en días de calendario entre dos fechas "YYYY-MM-DD", sin pasar
// por zona horaria: las dos son fechas civiles puras (`reminders.due_date`
// es una columna `date`, no `timestamptz` -- ver el comentario de
// ReminderListRow en queries.ts), así que comparar sus componentes
// año/mes/día anclados a UTC (sin horas) da el resultado correcto sin
// arriesgar un corrimiento de un día por offset, sea cual sea la zona del
// servidor que ejecuta esto.
export function daysBetween(fromDateStr: string, toDateStr: string): number {
  return Math.round(
    (dateStringToUtcMs(toDateStr) - dateStringToUtcMs(fromDateStr)) /
      86_400_000,
  );
}

function dateStringToUtcMs(dateStr: string): number {
  const [year, month, day] = dateStr.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  return Date.UTC(year, month - 1, day);
}

// Frase corta para la lista de próximos vencimientos y el detalle del
// calendario -- mismo criterio de "hechos, no órdenes" que
// `formatRelativeDate` (src/lib/format-date.ts): no es voseo porque no le
// pide nada al usuario, describe cuándo vence.
export function describeReminderDueDate(
  dueDate: string,
  today: string,
): string {
  const diff = daysBetween(today, dueDate);
  if (diff < 0) {
    const overdueDays = Math.abs(diff);
    return overdueDays === 1
      ? "Venció hace 1 día"
      : `Venció hace ${overdueDays} días`;
  }
  if (diff === 0) {
    return "Vence hoy";
  }
  if (diff === 1) {
    return "Vence mañana";
  }
  return `Vence en ${diff} días`;
}
