import { z } from "zod";

import { ticketPriority, ticketStatus } from "@/db/schema";

// Paso 6.4 -- acciones sobre un reclamo (cambiar estado, prioridad,
// responsable, agregar nota). Separado de actions.ts porque un archivo
// "use server" solo puede exportar funciones async (mismo motivo que ya
// separó building-schema.ts/unit-schema.ts de sus actions.ts respectivos)
// -- acá viven los tipos, los Zod schemas y la lógica PURA de transición de
// estado, testeable con Vitest sin tocar la base.

export type TicketStatusValue = (typeof ticketStatus.enumValues)[number];
export type TicketPriorityValue = (typeof ticketPriority.enumValues)[number];

// -----------------------------------------------------------------------
// Transiciones de estado -- pensadas contra lo que pasa de verdad en un
// consorcio, no contra un diagrama que permita "cualquiera a cualquiera".
// Ver el reporte del paso 6.4 para el razonamiento completo de cada
// flecha; resumen acá, al lado del código que lo aplica:
//
// - new -> in_progress: el administrador empieza a trabajarlo.
// - new -> resolved: arreglo inmediato, sin pasar por "en progreso" (ej.
//   resetear una llave térmica) -- exigir el paso intermedio ahí sería
//   fricción sin beneficio real.
// - new -> discarded: duplicado, spam, o no aplica -- nunca se llegó a
//   trabajar.
// - in_progress -> resolved / discarded: mismo criterio que arriba, ya en
//   curso.
// - resolved -> closed: el camino normal -- se arregló, y ahora se cierra
//   formalmente el caso.
// - resolved -> in_progress (REABRIR): se creía resuelto y no lo estaba --
//   vuelve a trabajo activo, no a "nuevo" (ya se le dedicó tiempo).
// - closed -> in_progress (REABRIR): un cierre prematuro o por error --
//   mismo criterio, vuelve a trabajo activo.
// - discarded -> new (REABRIR): se creía que no aplicaba y sí aplicaba --
//   vuelve a "nuevo" y no a "en progreso", porque acá nunca se llegó a
//   trabajar nada (a diferencia de resolved/closed).
//
// Deliberadamente BLOQUEADAS -- no por faltar códigos, sino porque no
// describen nada que pase de verdad:
// - new -> closed directo: ya existe "discarded" para "no hace falta
//   arreglar nada" -- permitir además "closed" sin pasar por "resolved"
//   dejaría dos estados terminales para la misma situación real,
//   ambiguos entre sí.
// - in_progress -> new: nadie "desempieza" un trabajo ya arrancado; si en
//   los hechos no se hizo nada, discarded ya cubre ese caso.
// - resolved/closed -> discarded: no tiene sentido "descartar" algo que
//   ya se arregló.
// - discarded -> in_progress/resolved/closed directo: si nunca se
//   trabajó, tiene que pasar primero por "new" (reabrir) antes de avanzar
//   -- mismo criterio que cualquier reclamo nuevo.
// - closed -> resolved: closed siempre viene DESPUÉS de resolved (nunca
//   al revés); volver a "resolved" sin pasar por "in_progress" no
//   corresponde a ningún hecho real (¿qué se resolvió de nuevo?).
export const TICKET_STATUS_TRANSITIONS: Record<
  TicketStatusValue,
  TicketStatusValue[]
> = {
  new: ["in_progress", "resolved", "discarded"],
  in_progress: ["resolved", "discarded"],
  resolved: ["in_progress", "closed"],
  closed: ["in_progress"],
  discarded: ["new"],
};

export function isValidStatusTransition(
  from: TicketStatusValue,
  to: TicketStatusValue,
): boolean {
  if (from === to) {
    return false;
  }
  return TICKET_STATUS_TRANSITIONS[from].includes(to);
}

// "Reabrir" es la misma palabra sin importar el destino exacto (in_progress
// o new) -- el administrador no necesita pensar en el enum, solo en "esto
// necesita atención de nuevo". Las demás transiciones sí usan el verbo
// específico de a dónde van.
function isReopenTransition(
  from: TicketStatusValue,
  to: TicketStatusValue,
): boolean {
  return (
    (from === "resolved" && to === "in_progress") ||
    (from === "closed" && to === "in_progress") ||
    (from === "discarded" && to === "new")
  );
}

const STATUS_ACTION_LABEL: Record<TicketStatusValue, string> = {
  new: "Marcar como nuevo",
  in_progress: "Marcar en progreso",
  resolved: "Marcar como resuelto",
  closed: "Cerrar",
  discarded: "Descartar",
};

export type TicketStatusAction = {
  targetStatus: TicketStatusValue;
  label: string;
};

// Qué botones mostrar para el estado ACTUAL de un reclamo -- una acción por
// transición válida (ver el mapa de arriba), nunca un <select> con los 5
// estados donde algunos no tendrían sentido elegidos. Esto es, en la UI, la
// respuesta directa a "pensá en lo que realmente pasa, no en un diagrama
// prolijo": el administrador ve verbos ("Marcar en progreso", "Cerrar",
// "Reabrir"), no un estado en abstracto.
export function getTicketStatusActions(
  current: TicketStatusValue,
): TicketStatusAction[] {
  return TICKET_STATUS_TRANSITIONS[current].map((target) => ({
    targetStatus: target,
    label: isReopenTransition(current, target)
      ? "Reabrir"
      : STATUS_ACTION_LABEL[target],
  }));
}

// -----------------------------------------------------------------------
// Inputs de las Server Actions (validados con Zod, no solo con el tipo)
// -----------------------------------------------------------------------

export const changeTicketStatusInputSchema = z.object({
  ticketId: z.uuid(),
  // El estado que el CLIENTE cree que tiene ahora mismo (lo que ya está
  // renderizado en pantalla) -- la Server Action lo usa como compare-and-
  // swap contra la fila real (ver actions.ts): si no coincide más, alguien
  // más lo cambió mientras tanto, y la acción no se aplica a ciegas. Ver
  // CLAUDE.md > Acciones sobre un reclamo, "qué pasa con dos personas a la
  // vez".
  fromStatus: z.enum(ticketStatus.enumValues),
  toStatus: z.enum(ticketStatus.enumValues),
});

export const changeTicketPriorityInputSchema = z.object({
  ticketId: z.uuid(),
  priority: z.enum(ticketPriority.enumValues),
});

// "" (campo vaciado a mano) se trata como null -- desasignar, no como un
// string vacío guardado en la base. 100 caracteres alcanza de sobra para un
// nombre de responsable real (ver CLAUDE.md > Acceso a datos, tickets.
// assignee sigue siendo texto libre en este paso -- ver el reporte para el
// razonamiento completo).
export const assignTicketInputSchema = z.object({
  ticketId: z.uuid(),
  assignee: z
    .string()
    .trim()
    .max(100, "Como máximo 100 caracteres.")
    .nullable()
    .transform((value) => (value ? value : null)),
});

// Mismo tope que la descripción del formulario público (2000 caracteres,
// ver ticket-schema.ts) -- no hay motivo para que una nota interna tenga un
// límite distinto al del propio reclamo.
export const addTicketNoteInputSchema = z.object({
  ticketId: z.uuid(),
  note: z
    .string()
    .trim()
    .min(1, "La nota no puede estar vacía.")
    .max(2000, "Como máximo 2000 caracteres."),
});

export type TicketActionResult = { ok: true } | { ok: false; error: string };
