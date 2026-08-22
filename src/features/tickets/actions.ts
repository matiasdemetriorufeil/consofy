"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { ticketEvents, ticketSimilarityCandidates, tickets } from "@/db/schema";
import { applyIncidentGrouping } from "@/features/incidents/group-tickets-into-incident";
import { authorizedAction } from "@/lib/auth";

import { toBadgeStatus } from "./status-mapping";
import { STATUS_LABEL } from "./components/status-badge";
import {
  BULK_SELECTION_MAX,
  getTicketIdsForFilters,
  resolveTicketInboxFilters,
} from "./queries";
import {
  addTicketNoteInputSchema,
  assignTicketInputSchema,
  changeTicketPriorityInputSchema,
  changeTicketStatusInputSchema,
  isValidStatusTransition,
  resolveSimilarityCandidateInputSchema,
  timestampFieldsForStatus,
  type TicketActionResult,
} from "./ticket-actions-schema";
import {
  bulkAssignInputSchema,
  bulkChangeStatusInputSchema,
  type BulkActionResult,
  type BulkTicketSelection,
} from "./ticket-bulk-schema";
import {
  normalizeSearchParams,
  ticketInboxSearchParamsSchema,
} from "./ticket-inbox-schema";

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

// -----------------------------------------------------------------------
// Resolución de candidatos a duplicado (paso 7.3)
// -----------------------------------------------------------------------

// Agrupar/descartar UN candidato puntual (banner del detalle, paso 7.3) --
// actualiza SOLO la fila de ticket_similarity_candidates identificada por
// `candidateId`, nunca otras filas de otros pares (ni siquiera otras filas
// del MISMO ticket): dos candidatos del mismo reclamo se resuelven cada
// uno por su cuenta, a propósito (ver el comentario de la tabla en
// ticket-similarity-candidates.ts).
//
// "Agrupar" (paso 7.4) además arma/mantiene el incidente detrás del par --
// ver applyIncidentGrouping() (features/incidents/group-tickets-into-
// incident.ts) para los cuatro casos (crear, sumarse a uno existente,
// fusionar dos, o no-op si ya comparten incidente). "Descartar" nunca
// toca incidentes.
//
// TODO adentro de una transacción -- a diferencia de la primera versión
// de este paso (7.3), que hacía los INSERT/UPDATE sueltos: el caso de
// fusión puede reasignar MUCHOS tickets a la vez (todos los que
// apuntaban al incidente perdedor), y no tiene sentido que el candidato
// quede "grouped" si esa reasignación fallara a mitad de camino, o
// viceversa.
//
// Compare-and-swap contra `status = 'pending'` (mismo criterio que
// changeTicketStatusAction, paso 6.4): si el candidato ya se resolvió por
// otro lado (doble click, dos pestañas), el UPDATE no toca ninguna fila y
// se devuelve un error claro en vez de aplicar una resolución sobre algo
// que ya no está pendiente.
export const resolveSimilarityCandidateAction = authorizedAction(
  async (context, input: unknown): Promise<TicketActionResult> => {
    const parsed = resolveSimilarityCandidateInputSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Datos inválidos." };
    }
    const { candidateId, resolution } = parsed.data;

    const result = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(ticketSimilarityCandidates)
        .set({ status: resolution })
        .where(
          and(
            eq(ticketSimilarityCandidates.id, candidateId),
            eq(
              ticketSimilarityCandidates.organizationId,
              context.organization.id,
            ),
            eq(ticketSimilarityCandidates.status, "pending"),
            isNull(ticketSimilarityCandidates.deletedAt),
          ),
        )
        .returning({
          ticketId: ticketSimilarityCandidates.ticketId,
          candidateTicketId: ticketSimilarityCandidates.candidateTicketId,
        });

      if (!updated) {
        return {
          ok: false as const,
          error:
            "Este candidato ya no está pendiente -- recargá la página para ver el estado actual.",
        };
      }

      // Los DOS tickets del par -- para el evento (necesita el
      // public_code del OTRO ticket en cada payload), para la agrupación
      // en incidentes (necesita category_id/incident_id de los dos) y
      // para revalidar las dos rutas de detalle -- un solo SELECT con
      // inArray, no varios round-trips.
      const bothTickets = await tx
        .select({
          id: tickets.id,
          publicCode: tickets.publicCode,
          buildingId: tickets.buildingId,
          categoryId: tickets.categoryId,
          incidentId: tickets.incidentId,
        })
        .from(tickets)
        .where(
          and(
            inArray(tickets.id, [updated.ticketId, updated.candidateTicketId]),
            eq(tickets.organizationId, context.organization.id),
          ),
        );
      const newTicket = bothTickets.find((t) => t.id === updated.ticketId);
      const oldTicket = bothTickets.find(
        (t) => t.id === updated.candidateTicketId,
      );
      if (!newTicket || !oldTicket) {
        // No debería pasar (las FK compuestas de
        // ticket_similarity_candidates garantizan que las dos filas
        // existen en ESTA organización), pero si pasara, la fila ya
        // quedó resuelta en la base -- no tiene sentido fingir que la
        // acción falló. `newTicket`/`oldTicket` explícitos en `null` acá
        // (no ausentes) para que el shape de retorno sea el MISMO en las
        // dos ramas -- el caller narrowea con un chequeo de null simple,
        // no con `"prop" in result` (menos confiable contra la inferencia
        // de tipo de db.transaction()).
        return {
          ok: true as const,
          newTicket: null,
          oldTicket: null,
          touchedIncidentIds: [] as string[],
        };
      }

      const eventType =
        resolution === "grouped"
          ? ("similar_ticket_grouped" as const)
          : ("similar_ticket_discarded" as const);

      // Un evento en CADA ticket del par -- mismo criterio que
      // similar_ticket_detected (paso 7.2): cada reclamo tiene que poder
      // explicar, mirando SOLO su propia línea de tiempo, qué pasó con
      // esto. Tipado explícito (no inferido de los dos objetos
      // iniciales): más abajo se le hace `push()` con los eventos de
      // applyIncidentGrouping(), que usan otros valores del mismo enum
      // (merged_into_incident/incident_merged).
      const events: (typeof ticketEvents.$inferInsert)[] = [
        {
          organizationId: context.organization.id,
          ticketId: newTicket.id,
          type: eventType,
          actorType: "admin" as const,
          actorLabel: context.appUser.displayName,
          payload: {
            otherTicketId: oldTicket.id,
            otherPublicCode: oldTicket.publicCode,
          },
        },
        {
          organizationId: context.organization.id,
          ticketId: oldTicket.id,
          type: eventType,
          actorType: "admin" as const,
          actorLabel: context.appUser.displayName,
          payload: {
            otherTicketId: newTicket.id,
            otherPublicCode: newTicket.publicCode,
          },
        },
      ];

      let touchedIncidentIds: string[] = [];
      if (resolution === "grouped") {
        const grouping = await applyIncidentGrouping(
          tx,
          context.organization.id,
          context.appUser.displayName,
          newTicket,
          oldTicket,
        );
        events.push(...grouping.events);
        touchedIncidentIds = grouping.touchedIncidentIds;
      }

      await tx.insert(ticketEvents).values(events);

      return {
        ok: true as const,
        newTicket,
        oldTicket,
        touchedIncidentIds,
      };
    });

    if (!result.ok) {
      return result;
    }
    if (!result.newTicket || !result.oldTicket) {
      return { ok: true };
    }

    revalidateTicketPaths(result.newTicket.id, result.newTicket.buildingId);
    revalidateTicketPaths(result.oldTicket.id, result.oldTicket.buildingId);
    for (const incidentId of result.touchedIncidentIds) {
      revalidatePath(`/panel/incidents/${incidentId}`);
    }
    return { ok: true };
  },
);

// -----------------------------------------------------------------------
// Acciones masivas (paso 6.5)
// -----------------------------------------------------------------------

// A diferencia de revalidateTicketPaths() (arriba, para UN reclamo con un
// buildingId conocido), un lote puede tocar reclamos de VARIOS edificios a
// la vez -- se revalida el patrón literal con corchetes para CUALQUIER
// buildingId/ticketId (mismo criterio ya usado en imports/actions.ts y en
// buildings/actions.ts para "todos los edificios", ver esos archivos).
function revalidateBulkPaths() {
  revalidatePath("/panel/tickets");
  revalidatePath("/panel/tickets/[ticketId]");
  revalidatePath("/panel/buildings/[buildingId]/tickets");
  revalidatePath("/panel", "layout");
}

// Traduce una selección (paso 6.5, ver ticket-bulk-schema.ts) a la lista
// real de ids sobre la que va a operar la acción -- "ids" ya la trae
// resuelta; "filtered" vuelve a correr el MISMO filtro que arma la
// bandeja (resolveTicketInboxFilters + getTicketIdsForFilters,
// queries.ts) para traer TODOS los ids que matchean AHORA, nunca una
// lista vieja armada en el cliente cuando se tildó la casilla. Devuelve
// error si el filtro trae más de BULK_SELECTION_MAX reclamos -- un tope
// de sanidad, no una limitación técnica (la consulta y el UPDATE son O(1)
// en cantidad de round-trips sin importar cuántas filas toquen, ver el
// reporte del paso), pensado para que "seleccionar todo lo filtrado"
// nunca ejecute silenciosamente sobre un filtro mucho más ancho de lo que
// el administrador imaginaba.
async function resolveSelectionIds(
  organizationId: string,
  organizationTimezone: string,
  selection: BulkTicketSelection,
): Promise<{ ok: true; ids: string[] } | { ok: false; error: string }> {
  if (selection.mode === "ids") {
    return { ok: true, ids: selection.ticketIds };
  }

  const parsedFilters = ticketInboxSearchParamsSchema.safeParse(
    normalizeSearchParams(selection.filters),
  );
  const filters = parsedFilters.success
    ? parsedFilters.data
    : ticketInboxSearchParamsSchema.parse({});
  const inboxFilters = resolveTicketInboxFilters(filters, organizationTimezone);
  const ids = await getTicketIdsForFilters(organizationId, inboxFilters);

  if (ids.length > BULK_SELECTION_MAX) {
    return {
      ok: false,
      error: `Hay demasiados reclamos con este filtro (más de ${BULK_SELECTION_MAX}) -- achicá el filtro antes de aplicar una acción masiva.`,
    };
  }
  return { ok: true, ids };
}

// Cambiar estado en lote -- "se hace lo que se puede", nunca todo o nada
// (ver CLAUDE.md > Acciones masivas): cada reclamo del lote se valida CON
// SU PROPIO estado actual (leído fresco en esta misma consulta, nunca
// asumido) contra isValidStatusTransition() -- el mismo mapa de
// transiciones del paso 6.4, sin duplicarlo. Los que sí pueden se
// actualizan en UN SOLO UPDATE (WHERE id = ANY(...)), sin importar si son
// 2 o 200 -- ver el reporte del paso para la medición real. Un evento por
// reclamo actualizado (nunca uno solo "resumen"): ticket_events está
// indexado por ticket_id, así que un evento compartido sería invisible en
// la línea de tiempo de cualquiera de esos reclamos vista individualmente
// -- exactamente lo que un administrador mirando UN reclamo después
// necesita entender.
export const bulkChangeTicketStatusAction = authorizedAction(
  async (context, input: unknown): Promise<BulkActionResult> => {
    const parsed = bulkChangeStatusInputSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Datos inválidos." };
    }
    const { selection, toStatus } = parsed.data;

    const resolved = await resolveSelectionIds(
      context.organization.id,
      context.organization.timezone,
      selection,
    );
    if (!resolved.ok) {
      return resolved;
    }
    if (resolved.ids.length === 0) {
      return { ok: false, error: "No hay reclamos para actualizar." };
    }

    const current = await db
      .select({ id: tickets.id, status: tickets.status })
      .from(tickets)
      .where(
        and(
          inArray(tickets.id, resolved.ids),
          eq(tickets.organizationId, context.organization.id),
          isNull(tickets.deletedAt),
        ),
      );

    const notFoundCount = resolved.ids.length - current.length;
    const eligible = current.filter((t) =>
      isValidStatusTransition(t.status, toStatus),
    );
    const skippedCount = current.length - eligible.length;

    if (eligible.length === 0) {
      return { ok: true, updatedCount: 0, skippedCount, notFoundCount };
    }

    const now = new Date();
    const eligibleIds = eligible.map((t) => t.id);

    await db
      .update(tickets)
      .set({ status: toStatus, ...timestampFieldsForStatus(toStatus, now) })
      .where(
        and(
          inArray(tickets.id, eligibleIds),
          eq(tickets.organizationId, context.organization.id),
        ),
      );

    await db.insert(ticketEvents).values(
      eligible.map((t) => ({
        organizationId: context.organization.id,
        ticketId: t.id,
        type: "status_changed" as const,
        actorType: "admin" as const,
        actorLabel: context.appUser.displayName,
        payload: { from: t.status, to: toStatus },
      })),
    );

    revalidateBulkPaths();
    return {
      ok: true,
      updatedCount: eligible.length,
      skippedCount,
      notFoundCount,
    };
  },
);

// Asignar responsable en lote -- sin concepto de "transición inválida"
// (mismo criterio que la acción individual del paso 6.4): el único motivo
// para saltar un reclamo es que YA tenga ese mismo responsable (no
// escribir un evento sin cambio real).
export const bulkAssignTicketsAction = authorizedAction(
  async (context, input: unknown): Promise<BulkActionResult> => {
    const parsed = bulkAssignInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos.",
      };
    }
    const { selection, assignee } = parsed.data;

    const resolved = await resolveSelectionIds(
      context.organization.id,
      context.organization.timezone,
      selection,
    );
    if (!resolved.ok) {
      return resolved;
    }
    if (resolved.ids.length === 0) {
      return { ok: false, error: "No hay reclamos para actualizar." };
    }

    const current = await db
      .select({ id: tickets.id, assignee: tickets.assignee })
      .from(tickets)
      .where(
        and(
          inArray(tickets.id, resolved.ids),
          eq(tickets.organizationId, context.organization.id),
          isNull(tickets.deletedAt),
        ),
      );

    const notFoundCount = resolved.ids.length - current.length;
    const eligible = current.filter((t) => t.assignee !== assignee);
    const skippedCount = current.length - eligible.length;

    if (eligible.length === 0) {
      return { ok: true, updatedCount: 0, skippedCount, notFoundCount };
    }

    const eligibleIds = eligible.map((t) => t.id);

    await db
      .update(tickets)
      .set({ assignee })
      .where(
        and(
          inArray(tickets.id, eligibleIds),
          eq(tickets.organizationId, context.organization.id),
        ),
      );

    await db.insert(ticketEvents).values(
      eligible.map((t) => ({
        organizationId: context.organization.id,
        ticketId: t.id,
        type: "assigned" as const,
        actorType: "admin" as const,
        actorLabel: context.appUser.displayName,
        payload: { assignee },
      })),
    );

    revalidateBulkPaths();
    return {
      ok: true,
      updatedCount: eligible.length,
      skippedCount,
      notFoundCount,
    };
  },
);
