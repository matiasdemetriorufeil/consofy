import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import { buildings, categories, incidents, tickets } from "@/db/schema";

// Tipo del cliente transaccional que arma db.transaction() -- extraído del
// propio tipo de la función en vez de importar un tipo de drizzle-orm a
// mano, para que quede sincronizado solo si `db` cambia de driver. Este
// archivo SIEMPRE corre adentro de la transacción de
// resolveSimilarityCandidateAction (tickets/actions.ts) -- nunca con `db`
// suelto -- porque agrupar puede tocar varias filas de `tickets` a la vez
// (el caso de fusión) y necesita que todo o nada se aplique junto.
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type NewTicketEventInput = {
  organizationId: string;
  ticketId: string;
  type: "merged_into_incident" | "incident_merged";
  actorType: "admin";
  actorLabel: string;
  payload: Record<string, unknown>;
};

export type IncidentGroupingResult = {
  events: NewTicketEventInput[];
  // Incidentes cuya página de detalle (paso 7.4) puede haber cambiado --
  // el caller (tickets/actions.ts) revalida sus rutas además de las de los
  // dos tickets. Vacío en el caso "ya estaban en el mismo incidente" (no
  // cambió nada que revalidar).
  touchedIncidentIds: string[];
};

type TicketForGrouping = {
  id: string;
  publicCode: string;
  buildingId: string;
  categoryId: string;
  incidentId: string | null;
};

// Título automático del incidente -- no hay ninguna pantalla en este paso
// que le pida un título a mano al administrador ("Agrupar" es un click
// único, sin formulario intermedio), así que se arma solo a partir de lo
// que YA se sabe con certeza: categoría + edificio (los dos tickets del
// par siempre comparten los dos, por cómo filtra findSimilarTickets --
// paso 7.1 -- antes de proponer un candidato).
async function buildIncidentTitle(
  tx: DbTransaction,
  buildingId: string,
  categoryId: string,
): Promise<string> {
  const [building] = await tx
    .select({ name: buildings.name })
    .from(buildings)
    .where(eq(buildings.id, buildingId));
  const [category] = await tx
    .select({ name: categories.name })
    .from(categories)
    .where(eq(categories.id, categoryId));
  return `${category?.name ?? "Reclamos"} en ${building?.name ?? "el edificio"}`;
}

// Aplica la agrupación en incidentes que dispara "Agrupar" (paso 7.4) --
// llamada SOLO cuando resolveSimilarityCandidateAction resuelve un
// candidato con resolution "grouped" (tickets/actions.ts), nunca para
// "discarded". Cuatro casos, mutuamente excluyentes, sobre el par
// (ticketA, ticketB) del candidato que se acaba de agrupar:
//
// 1. Ninguno tiene incidente -- se crea uno nuevo y los dos quedan
//    apuntando a él.
// 2. Exactamente uno tiene incidente -- el otro se suma a ESE incidente
//    (nunca se crea uno nuevo).
// 3. Los dos tienen el MISMO incidente -- ya están agrupados, no hay nada
//    que hacer acá (el candidato ya quedó "grouped" en actions.ts, eso
//    alcanza).
// 4. Los dos tienen incidentes DISTINTOS -- fusión: uno de los dos
//    "gana" (persiste) y el otro se soft-borra, reasignando TODOS los
//    tickets que apuntaban al perdedor (no solo ticketA/ticketB) al
//    ganador.
//
// Devuelve los eventos a insertar (tickets/actions.ts los escribe junto
// con similar_ticket_grouped, en el mismo INSERT) -- esta función no
// escribe en ticket_events directamente, para que el caller controle el
// orden y pueda insertarlos todos de una vez.
export async function applyIncidentGrouping(
  tx: DbTransaction,
  organizationId: string,
  actorLabel: string,
  ticketA: TicketForGrouping,
  ticketB: TicketForGrouping,
): Promise<IncidentGroupingResult> {
  // Caso 3: ya agrupados en el mismo incidente -- no-op explícito, no un
  // efecto secundario de que ninguna rama de abajo matchee.
  if (
    ticketA.incidentId &&
    ticketB.incidentId &&
    ticketA.incidentId === ticketB.incidentId
  ) {
    return { events: [], touchedIncidentIds: [] };
  }

  // Caso 4: cada uno tiene un incidente, pero DISTINTO -- fusión.
  if (ticketA.incidentId && ticketB.incidentId) {
    const [incidentRowA, incidentRowB] = await Promise.all([
      tx
        .select({
          id: incidents.id,
          title: incidents.title,
          createdAt: incidents.createdAt,
        })
        .from(incidents)
        .where(eq(incidents.id, ticketA.incidentId))
        .then((rows) => rows[0]),
      tx
        .select({
          id: incidents.id,
          title: incidents.title,
          createdAt: incidents.createdAt,
        })
        .from(incidents)
        .where(eq(incidents.id, ticketB.incidentId))
        .then((rows) => rows[0]),
    ]);
    if (!incidentRowA || !incidentRowB) {
      // No debería pasar (tickets.incident_id tiene FK compuesta hacia
      // incidents(id, organization_id)) -- si pasara, no hay nada
      // consistente que fusionar; se deja como estaba.
      return { events: [], touchedIncidentIds: [] };
    }

    // Criterio elegido para qué incidente "gana" (persiste): el más
    // VIEJO (createdAt menor). Motivo: es el que lleva más tiempo
    // trackeando el problema -- probablemente el que más tickets/
    // historia ya acumuló -- y es un criterio determinístico y estable
    // (no depende de cuál de los dos tickets del PAR llegó como
    // `ticketId` vs. `candidateTicketId`, que es un detalle de
    // implementación de 7.1/7.2, no una señal de negocio).
    const [winner, loser] =
      incidentRowA.createdAt <= incidentRowB.createdAt
        ? [incidentRowA, incidentRowB]
        : [incidentRowB, incidentRowA];

    // TODOS los tickets que apuntaban al perdedor -- no solo ticketA/
    // ticketB del candidato que disparó la fusión. Un incidente perdedor
    // puede tener más tickets propios (de agrupaciones anteriores), y
    // esos también tienen que reasignarse: dejarlos apuntando a un
    // incidente soft-borrado los volvería huérfanos en la práctica (su
    // "problema en común" ya no aparecería en ningún listado que filtre
    // incidentes activos).
    const affectedTickets = await tx
      .select({ id: tickets.id, publicCode: tickets.publicCode })
      .from(tickets)
      .where(
        and(
          eq(tickets.incidentId, loser.id),
          eq(tickets.organizationId, organizationId),
          isNull(tickets.deletedAt),
        ),
      );

    if (affectedTickets.length > 0) {
      await tx
        .update(tickets)
        .set({ incidentId: winner.id })
        .where(
          and(
            inArray(
              tickets.id,
              affectedTickets.map((t) => t.id),
            ),
            eq(tickets.organizationId, organizationId),
          ),
        );
    }

    await tx
      .update(incidents)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(incidents.id, loser.id),
          eq(incidents.organizationId, organizationId),
        ),
      );

    return {
      events: affectedTickets.map((t) => ({
        organizationId,
        ticketId: t.id,
        type: "incident_merged" as const,
        actorType: "admin" as const,
        actorLabel,
        payload: {
          fromIncidentId: loser.id,
          toIncidentId: winner.id,
          toIncidentTitle: winner.title,
        },
      })),
      touchedIncidentIds: [winner.id, loser.id],
    };
  }

  // Caso 2: exactamente uno de los dos ya tiene incidente -- el otro se
  // suma a ESE.
  if (ticketA.incidentId || ticketB.incidentId) {
    const existingIncidentId = (ticketA.incidentId ??
      ticketB.incidentId) as string;
    const joiningTicket = ticketA.incidentId ? ticketB : ticketA;

    const [incident] = await tx
      .select({ id: incidents.id, title: incidents.title })
      .from(incidents)
      .where(eq(incidents.id, existingIncidentId));
    if (!incident) {
      return { events: [], touchedIncidentIds: [] };
    }

    await tx
      .update(tickets)
      .set({ incidentId: incident.id })
      .where(
        and(
          eq(tickets.id, joiningTicket.id),
          eq(tickets.organizationId, organizationId),
        ),
      );

    return {
      events: [
        {
          organizationId,
          ticketId: joiningTicket.id,
          type: "merged_into_incident" as const,
          actorType: "admin" as const,
          actorLabel,
          payload: {
            incidentId: incident.id,
            incidentTitle: incident.title,
            reason: "joined" as const,
          },
        },
      ],
      touchedIncidentIds: [incident.id],
    };
  }

  // Caso 1: ninguno tiene incidente -- se crea uno nuevo para los dos.
  const title = await buildIncidentTitle(
    tx,
    ticketA.buildingId,
    ticketA.categoryId,
  );
  const [newIncident] = await tx
    .insert(incidents)
    .values({
      organizationId,
      buildingId: ticketA.buildingId,
      categoryId: ticketA.categoryId,
      title,
    })
    .returning({ id: incidents.id, title: incidents.title });
  if (!newIncident) {
    throw new Error("INCIDENT_CREATE_FAILED");
  }

  await tx
    .update(tickets)
    .set({ incidentId: newIncident.id })
    .where(
      and(
        inArray(tickets.id, [ticketA.id, ticketB.id]),
        eq(tickets.organizationId, organizationId),
      ),
    );

  return {
    events: [ticketA, ticketB].map((t) => ({
      organizationId,
      ticketId: t.id,
      type: "merged_into_incident" as const,
      actorType: "admin" as const,
      actorLabel,
      payload: {
        incidentId: newIncident.id,
        incidentTitle: newIncident.title,
        reason: "created" as const,
      },
    })),
    touchedIncidentIds: [newIncident.id],
  };
}
