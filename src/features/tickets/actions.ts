"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { ticketEvents, tickets } from "@/db/schema";
import { authorizedAction } from "@/lib/auth";

import { toBadgeStatus } from "./status-mapping";
import { STATUS_LABEL } from "./components/status-badge";
import {
  addTicketNoteInputSchema,
  assignTicketInputSchema,
  changeTicketPriorityInputSchema,
  changeTicketStatusInputSchema,
  isValidStatusTransition,
  type TicketActionResult,
  type TicketStatusValue,
} from "./ticket-actions-schema";

// Acciones sobre un reclamo (paso 6.4) -- hasta acá el panel solo miraba
// (paso 6.3); desde acá el administrador trabaja. Las cuatro pasan por
// authorizedAction() (ver CLAUDE.md > Autorización de rutas y Server
// Actions) y filtran SIEMPRE por organizationId en el WHERE de la consulta
// misma -- mismo patrón que buildings/units/people actions.ts, nada nuevo
// acá en cuanto a aislamiento.

function revalidateTicketPaths(ticketId: string, buildingId?: string) {
  revalidatePath(`/panel/tickets/${ticketId}`);
  revalidatePath("/panel/tickets");
  // Dashboard de inicio: getTicketSummaryByBuilding/getAttentionTickets
  // cuentan por estado -- un cambio de estado/prioridad lo afecta.
  revalidatePath("/panel", "layout");
  if (buildingId) {
    revalidatePath(`/panel/buildings/${buildingId}/tickets`);
  }
}

// resolved_at/closed_at según el estado destino -- calculado acá, no
// dejado en manos de quien llama, para que sea IMPOSIBLE violar los CHECK
// de tickets.ts (tickets_resolved_at_requires_resolved_or_closed,
// tickets_closed_at_requires_closed) sin importar desde qué estado se
// venga:
// - -> resolved: resolved_at = ahora, closed_at se limpia (por las dudas;
//   el mapa de transiciones nunca llega a "resolved" viniendo de
//   "closed", pero limpiarlo igual no cuesta nada y blinda el invariante).
// - -> closed: closed_at = ahora. resolved_at NO se toca -- closed solo es
//   alcanzable desde resolved (ver TICKET_STATUS_TRANSITIONS), así que ya
//   tiene que estar seteado; conservarlo preserva CUÁNDO se resolvió de
//   verdad, no lo pisa con el momento del cierre.
// - -> in_progress / new / discarded: los dos se limpian -- "reabrir"
//   pierde la marca de tiempo de haber estado resuelto/cerrado (el
//   historial completo igual queda en ticket_events, que es append-only;
//   estas columnas reflejan el estado ACTUAL, no un archivo histórico).
function timestampFieldsForStatus(
  status: TicketStatusValue,
  now: Date,
): { resolvedAt?: Date | null; closedAt: Date | null } {
  if (status === "resolved") {
    return { resolvedAt: now, closedAt: null };
  }
  if (status === "closed") {
    // resolvedAt AUSENTE (no `null`) a propósito -- closed solo es
    // alcanzable desde resolved (ver TICKET_STATUS_TRANSITIONS), así que
    // ya tiene que estar seteado; omitir la clave del `.set()` de Drizzle
    // deja la columna intacta, preservando CUÁNDO se resolvió de verdad
    // en vez de pisarlo con el momento del cierre.
    return { closedAt: now };
  }
  return { resolvedAt: null, closedAt: null };
}

// Cambiar estado -- protegido con compare-and-swap contra `fromStatus`
// (paso 6.4, "qué pasa si dos personas hacen acciones a la vez"): el
// cliente manda el estado que YA TENÍA renderizado, y el UPDATE solo
// aplica si la fila todavía está en ese estado. Dos motivos separados para
// que la acción no se aplique, distinguidos con una consulta extra SOLO en
// el camino de error (nunca en el normal, mismo criterio que
// getTicketInboxCount en el paso 6.2):
// 1. La transición no es válida NI SIQUIERA asumiendo que `fromStatus` es
//    verdad (ver isValidStatusTransition) -- se corta ANTES de tocar la
//    base, sin round-trip.
// 2. La transición SERÍA válida desde `fromStatus`, pero la fila real ya
//    no está ahí -- alguien más la cambió mientras este administrador
//    tenía la pantalla abierta. Acá SÍ hace falta la consulta extra, para
//    decirle con precisión en qué estado está de verdad ahora.
export const changeTicketStatusAction = authorizedAction(
  async (context, input: unknown): Promise<TicketActionResult> => {
    const parsed = changeTicketStatusInputSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Datos inválidos." };
    }
    const { ticketId, fromStatus, toStatus } = parsed.data;

    if (!isValidStatusTransition(fromStatus, toStatus)) {
      return {
        ok: false,
        error: `No se puede pasar de "${STATUS_LABEL[toBadgeStatus(fromStatus)]}" a "${STATUS_LABEL[toBadgeStatus(toStatus)]}".`,
      };
    }

    const now = new Date();

    const [updated] = await db
      .update(tickets)
      .set({ status: toStatus, ...timestampFieldsForStatus(toStatus, now) })
      .where(
        and(
          eq(tickets.id, ticketId),
          eq(tickets.organizationId, context.organization.id),
          eq(tickets.status, fromStatus),
          isNull(tickets.deletedAt),
        ),
      )
      .returning({ id: tickets.id, buildingId: tickets.buildingId });

    if (!updated) {
      const [current] = await db
        .select({ status: tickets.status })
        .from(tickets)
        .where(
          and(
            eq(tickets.id, ticketId),
            eq(tickets.organizationId, context.organization.id),
            isNull(tickets.deletedAt),
          ),
        );

      if (!current) {
        return { ok: false, error: "No encontramos ese reclamo." };
      }

      return {
        ok: false,
        error: `El reclamo cambió mientras tanto: ahora está en "${STATUS_LABEL[toBadgeStatus(current.status)]}". Recargá la página para ver el estado actual.`,
      };
    }

    await db.insert(ticketEvents).values({
      organizationId: context.organization.id,
      ticketId,
      type: "status_changed",
      actorType: "admin",
      actorLabel: context.appUser.displayName,
      payload: { from: fromStatus, to: toStatus },
    });

    revalidateTicketPaths(ticketId, updated.buildingId);
    return { ok: true };
  },
);

// Cambiar prioridad -- sin concepto de "transición inválida" (las 4
// prioridades son intercambiables libremente en cualquier sentido, a
// diferencia del estado), así que no hace falta compare-and-swap: un
// UPDATE directo alcanza, mismo criterio que el resto del proyecto
// (buildings/units, ver actions.ts de esos features). Bajo una carrera
// real (dos administradores cambiando la prioridad casi al mismo tiempo),
// gana la escritura que llegue después -- el historial en ticket_events
// registra las dos igual, con su actor y su hora real, así que nada se
// pierde para AUDITORÍA aunque el valor final sea "el último que escribió
// gana". Es una lectura + escritura, no atómica en el sentido estricto
// (podría, en teoría, registrar un "from" ya no exacto si alguien más
// escribió justo en el medio) -- aceptable acá porque el costo de
// equivocarse es bajo (un dato de prioridad, no una máquina de estados) y
// el valor FINAL guardado siempre es el correcto.
export const changeTicketPriorityAction = authorizedAction(
  async (context, input: unknown): Promise<TicketActionResult> => {
    const parsed = changeTicketPriorityInputSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Datos inválidos." };
    }
    const { ticketId, priority } = parsed.data;

    const [current] = await db
      .select({ priority: tickets.priority, buildingId: tickets.buildingId })
      .from(tickets)
      .where(
        and(
          eq(tickets.id, ticketId),
          eq(tickets.organizationId, context.organization.id),
          isNull(tickets.deletedAt),
        ),
      );

    if (!current) {
      return { ok: false, error: "No encontramos ese reclamo." };
    }
    if (current.priority === priority) {
      return { ok: false, error: "Ya tiene esa prioridad." };
    }

    await db
      .update(tickets)
      .set({ priority })
      .where(
        and(
          eq(tickets.id, ticketId),
          eq(tickets.organizationId, context.organization.id),
        ),
      );

    await db.insert(ticketEvents).values({
      organizationId: context.organization.id,
      ticketId,
      type: "priority_changed",
      actorType: "admin",
      actorLabel: context.appUser.displayName,
      payload: { from: current.priority, to: priority },
    });

    revalidateTicketPaths(ticketId, current.buildingId);
    return { ok: true };
  },
);

// Asignar responsable -- `tickets.assignee` sigue siendo texto libre en
// este paso (ver el comentario de esa columna en src/db/schema/tickets.ts
// y el de app_users.ts: "cuando exista [una tabla de usuarios del panel],
// este campo se reemplaza por una FK" -- esa tabla todavía no tiene
// invitación de usuarios ni más de un rol real, así que no hay a qué
// apuntar una FK todavía). `null` desasigna -- un estado real y
// consultable (ver UNASSIGNED_ASSIGNEE_VALUE en el filtro del paso 6.1),
// no solo "vacío por defecto".
export const assignTicketAction = authorizedAction(
  async (context, input: unknown): Promise<TicketActionResult> => {
    const parsed = assignTicketInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos.",
      };
    }
    const { ticketId, assignee } = parsed.data;

    const [current] = await db
      .select({ assignee: tickets.assignee, buildingId: tickets.buildingId })
      .from(tickets)
      .where(
        and(
          eq(tickets.id, ticketId),
          eq(tickets.organizationId, context.organization.id),
          isNull(tickets.deletedAt),
        ),
      );

    if (!current) {
      return { ok: false, error: "No encontramos ese reclamo." };
    }
    if (current.assignee === assignee) {
      return {
        ok: false,
        error: assignee
          ? "Ya está asignado a esa persona."
          : "Ya no tiene a nadie asignado.",
      };
    }

    await db
      .update(tickets)
      .set({ assignee })
      .where(
        and(
          eq(tickets.id, ticketId),
          eq(tickets.organizationId, context.organization.id),
        ),
      );

    await db.insert(ticketEvents).values({
      organizationId: context.organization.id,
      ticketId,
      type: "assigned",
      actorType: "admin",
      actorLabel: context.appUser.displayName,
      payload: { assignee },
    });

    revalidateTicketPaths(ticketId, current.buildingId);
    return { ok: true };
  },
);

// Nota interna -- INSERT puro en ticket_events, sin tocar la fila de
// tickets: la nota ES el evento, no hay una tabla/columna aparte que
// duplique el texto (ver CLAUDE.md > Acciones sobre un reclamo para el
// análisis completo de por qué esto nunca puede filtrarse a una pantalla
// pública). Sin condición de carrera real que cuidar: dos notas
// concurrentes son dos INSERT independientes, Postgres las serializa sin
// que se pisen -- a diferencia de un UPDATE, un INSERT nunca "pierde" el
// otro.
export const addTicketNoteAction = authorizedAction(
  async (context, input: unknown): Promise<TicketActionResult> => {
    const parsed = addTicketNoteInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos.",
      };
    }
    const { ticketId, note } = parsed.data;

    const [current] = await db
      .select({ id: tickets.id, buildingId: tickets.buildingId })
      .from(tickets)
      .where(
        and(
          eq(tickets.id, ticketId),
          eq(tickets.organizationId, context.organization.id),
          isNull(tickets.deletedAt),
        ),
      );

    if (!current) {
      return { ok: false, error: "No encontramos ese reclamo." };
    }

    await db.insert(ticketEvents).values({
      organizationId: context.organization.id,
      ticketId,
      type: "note_added",
      actorType: "admin",
      actorLabel: context.appUser.displayName,
      payload: { note },
    });

    revalidateTicketPaths(ticketId, current.buildingId);
    return { ok: true };
  },
);
