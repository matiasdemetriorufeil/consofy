"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { incidents, ticketEvents, tickets } from "@/db/schema";
import { insertNotification } from "@/features/notifications/create-notification";
import { buildIncidentResolvedNotification } from "@/features/notifications/notification-content";
import {
  isValidStatusTransition,
  timestampFieldsForStatus,
} from "@/features/tickets/ticket-actions-schema";
import { authorizedAction } from "@/lib/auth";

import {
  resolveIncidentInputSchema,
  type ResolveIncidentResult,
} from "./incident-actions-schema";

// Resolver un incidente (paso 7.5) -- propagación en UN SOLO SENTIDO,
// decisión de diseño explícita del enunciado: resolver el incidente
// resuelve sus tickets asociados, pero resolver/cerrar un ticket
// individual (por la vía normal del paso 6.4, changeTicketStatusAction)
// NUNCA toca el incidente ni a los demás tickets del mismo incidente. No
// hay ninguna acción de "reabrir" un incidente en este paso -- no fue
// pedida.
//
// Reusa la MISMA máquina de transiciones del paso 6.4
// (isValidStatusTransition, timestampFieldsForStatus -- ambas movidas a
// tickets/ticket-actions-schema.ts en este paso para poder compartirlas de
// verdad, ver el comentario de timestampFieldsForStatus ahí) -- nada de
// esto se reimplementa acá. Un ticket queda "elegible" para la propagación
// solo si isValidStatusTransition(status_actual, "resolved") da true, que
// es EXACTAMENTE "new" o "in_progress" con el mapa actual
// (TICKET_STATUS_TRANSITIONS): un ticket ya en "resolved" no pasa el
// chequeo (from === to, la función lo rechaza explícitamente), y uno en
// "closed"/"discarded" tampoco (esas transiciones no están en el mapa) --
// así el requisito de "los que ya estaban en un estado terminal quedan
// intactos" sale gratis del mismo mecanismo, sin un chequeo aparte de
// "¿es terminal?".
export const resolveIncidentAction = authorizedAction(
  async (context, input: unknown): Promise<ResolveIncidentResult> => {
    const parsed = resolveIncidentInputSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Datos inválidos." };
    }
    const { incidentId } = parsed.data;

    const now = new Date();

    // Compare-and-swap contra status='open' -- mismo criterio que
    // changeTicketStatusAction (6.4): protege contra ejecutar la
    // propagación dos veces (doble click, dos pestañas, o el botón ya
    // debería estar oculto pero la Server Action no confía en eso). Si el
    // incidente ya no está 'open', el UPDATE no toca ninguna fila y la
    // acción rechaza con un mensaje claro -- CRITERIO ELEGIDO para "qué
    // pasa si ya está resuelto": la Server Action SIEMPRE rechaza esto,
    // independientemente de que la UI además oculte el botón (ver
    // ResolveIncidentButton) -- las dos capas, no una sola.
    const [updatedIncident] = await db
      .update(incidents)
      .set({ status: "resolved", resolvedAt: now })
      .where(
        and(
          eq(incidents.id, incidentId),
          eq(incidents.organizationId, context.organization.id),
          eq(incidents.status, "open"),
          isNull(incidents.deletedAt),
        ),
      )
      .returning({ id: incidents.id, title: incidents.title });

    if (!updatedIncident) {
      const [current] = await db
        .select({ status: incidents.status })
        .from(incidents)
        .where(
          and(
            eq(incidents.id, incidentId),
            eq(incidents.organizationId, context.organization.id),
            isNull(incidents.deletedAt),
          ),
        );

      if (!current) {
        return { ok: false, error: "No encontramos ese problema en común." };
      }
      return {
        ok: false,
        error: "Este problema en común ya está resuelto.",
      };
    }

    // Todos los tickets activos del incidente -- no solo los que estaban
    // renderizados en la pantalla que disparó la acción, para que la
    // propagación sea correcta incluso si otro ticket se agregó al
    // incidente después de que esta página cargó.
    const affectedTickets = await db
      .select({ id: tickets.id, status: tickets.status })
      .from(tickets)
      .where(
        and(
          eq(tickets.incidentId, incidentId),
          eq(tickets.organizationId, context.organization.id),
          isNull(tickets.deletedAt),
        ),
      );

    const eligible = affectedTickets.filter((t) =>
      isValidStatusTransition(t.status, "resolved"),
    );

    if (eligible.length > 0) {
      const eligibleIds = eligible.map((t) => t.id);

      await db
        .update(tickets)
        .set({
          status: "resolved",
          ...timestampFieldsForStatus("resolved", now),
        })
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
          type: "resolved_by_incident" as const,
          actorType: "admin" as const,
          actorLabel: context.appUser.displayName,
          payload: {
            incidentId,
            incidentTitle: updatedIncident.title,
            fromStatus: t.status,
          },
        })),
      );
    }

    // Notificación para el panel (paso 9.4) -- sin transacción propia
    // acá (a diferencia de createTicketAction), pero no hace falta: el
    // compare-and-swap de arriba (UPDATE ... WHERE status = 'open') ya es
    // la garantía de idempotencia -- si esta acción se reintenta (doble
    // click, dos pestañas) sobre un incidente que ESTA MISMA llamada ya
    // resolvió, `updatedIncident` sale vacío y la función corta antes de
    // llegar acá, así que nunca se genera una segunda notificación para la
    // misma resolución.
    await insertNotification(db, {
      organizationId: context.organization.id,
      relatedIncidentId: incidentId,
      ...buildIncidentResolvedNotification({
        incidentId,
        incidentTitle: updatedIncident.title,
      }),
    });

    revalidatePath(`/panel/incidents/${incidentId}`);
    revalidatePath("/panel/tickets");
    revalidatePath("/panel", "layout");
    for (const t of affectedTickets) {
      revalidatePath(`/panel/tickets/${t.id}`);
    }

    return {
      ok: true,
      resolvedCount: eligible.length,
      skippedCount: affectedTickets.length - eligible.length,
    };
  },
);
