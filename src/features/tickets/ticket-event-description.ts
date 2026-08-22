import { z } from "zod";

import type { ticketEventActorType, ticketEventType } from "@/db/schema";

import { PRIORITY_LABEL } from "./components/priority-badge";
import { STATUS_LABEL } from "./components/status-badge";
import { toBadgePriority, toBadgeStatus } from "./status-mapping";

// Función pura (paso 6.3): arma el texto en español de un evento de
// ticket_events para la línea de tiempo del detalle de un reclamo -- sin
// tocar la base ni el DOM, así que se prueba con Vitest, mismo criterio ya
// fijado en el proyecto para lógica con ramas reales (formatTicketMessage,
// buildWhatsAppUrl: ver CLAUDE.md > Mensaje al administrador).
//
// `payload` es jsonb sin shape garantizado por la base (ver el comentario
// de esa columna en src/db/schema/ticket-events.ts: "se valida con Zod en
// la capa de aplicación al escribir, no con un CHECK en la base") -- acá,
// del lado de LECTURA, se vuelve a validar con Zod antes de confiar en su
// forma, en vez de castear a mano. Un payload que no matchea (evento viejo
// con otra forma, escrito por un bug, o un tipo todavía sin ningún
// escritor real -- ver más abajo) no rompe la línea de tiempo entera: cae
// a un texto genérico pero honesto para ESE evento puntual.
export type TicketEventType = (typeof ticketEventType.enumValues)[number];
export type TicketEventActorType =
  (typeof ticketEventActorType.enumValues)[number];

export type TicketTimelineEventInput = {
  type: TicketEventType;
  actorType: TicketEventActorType;
  actorLabel: string;
  payload: unknown;
};

export type TicketEventDescription = {
  headline: string;
  // null cuando el evento se explica solo con el título -- no todo evento
  // necesita una segunda línea.
  detail: string | null;
};

const statusChangedPayloadSchema = z.object({
  from: z.enum(["new", "in_progress", "resolved", "closed", "discarded"]),
  to: z.enum(["new", "in_progress", "resolved", "closed", "discarded"]),
});

const priorityChangedPayloadSchema = z.object({
  from: z.enum(["low", "medium", "high", "urgent"]),
  to: z.enum(["low", "medium", "high", "urgent"]),
});

const assignedPayloadSchema = z.object({
  assignee: z.string().trim().min(1).nullable().optional(),
});

const noteAddedPayloadSchema = z.object({
  note: z.string().trim().min(1),
});

const attachmentAddedPayloadSchema = z.object({
  originalFilename: z.string().trim().min(1).optional(),
});

// Paso 7.4 -- primer escritor real (resolveSimilarityCandidateAction, al
// "Agrupar" un candidato). `incidentTitle` pasa de opcional a
// obligatorio ahora que existe ese escritor real -- ya no hay motivo para
// que un evento nuevo lo omita. `reason` es lo que distingue, en el
// MISMO tipo de evento, los dos casos que el paso 7.4 considera "un
// reclamo se agrupó con un problema en común" (a diferencia de la fusión
// de DOS incidentes, que es un hecho distinto -- ver incident_merged más
// abajo):
// - "created": ninguno de los dos tickets del par tenía incidente antes
//   -- se creó uno nuevo para los dos.
// - "joined": el OTRO ticket del par ya tenía incidente -- este se sumó
//   a ese mismo incidente existente.
const mergedIntoIncidentPayloadSchema = z.object({
  incidentId: z.uuid(),
  incidentTitle: z.string().trim().min(1),
  reason: z.enum(["created", "joined"]),
});

// Paso 7.4 -- SOLO para la fusión de dos incidentes distintos (ver el
// comentario largo de este valor en ticket-events.ts). Se escribe en cada
// ticket que estaba en el incidente PERDEDOR -- `toIncidentId` es el
// incidente que sobrevive (el que ese ticket pasa a tener ahora).
const incidentMergedPayloadSchema = z.object({
  fromIncidentId: z.uuid(),
  toIncidentId: z.uuid(),
  toIncidentTitle: z.string().trim().min(1),
});

// Paso 7.2 -- payload que escribe detectAndFlagSimilarTickets() por cada
// candidato sobre el umbral (ticket-similarity-candidates.ts).
const similarTicketDetectedPayloadSchema = z.object({
  candidateTicketId: z.uuid(),
  candidatePublicCode: z.string().trim().min(1),
  similarity: z.number().min(0).max(1),
});

// Paso 7.3 -- payload que escribe resolveSimilarityCandidateAction() en
// CADA uno de los dos tickets del par (actions.ts). Mismo shape para
// similar_ticket_grouped y similar_ticket_discarded -- lo único que
// cambia entre los dos es el `type` del evento, no la forma del payload.
const similarTicketResolvedPayloadSchema = z.object({
  otherTicketId: z.uuid(),
  otherPublicCode: z.string().trim().min(1),
});

function statusText(
  dbStatus: z.infer<typeof statusChangedPayloadSchema>["from"],
): string {
  return STATUS_LABEL[toBadgeStatus(dbStatus)];
}

function priorityText(
  dbPriority: z.infer<typeof priorityChangedPayloadSchema>["from"],
): string {
  return PRIORITY_LABEL[toBadgePriority(dbPriority)];
}

// Evento MÁS delicado de los ocho -- pedido explícito de escribir este
// texto con cuidado (ver CLAUDE.md > Evento de handoff): confirma que el
// vecino TOCÓ el botón "Enviar por WhatsApp", nunca que el mensaje se haya
// mandado ni que haya llegado a la administración. Entre el click y que el
// administrador reciba algo pasan pasos que este evento no puede ver
// (WhatsApp tiene que abrir, el vecino tiene que apretar "Enviar" ADENTRO
// de WhatsApp, recién ahí WhatsApp tiene que entregarlo -- un link wa.me no
// tiene webhook de entrega). El headline dice "abrió WhatsApp", no "avisó"
// ni "envió", y el detail repite la aclaración explícita en vez de dejarla
// implícita -- para que la pantalla nunca dé a entender que el
// administrador recibió algo que en realidad no está confirmado.
function describeWhatsappHandoff(actorLabel: string): TicketEventDescription {
  return {
    headline: `${actorLabel} abrió WhatsApp para avisar sobre este reclamo`,
    detail:
      "Esto confirma que tocó el botón, no que el mensaje se haya enviado ni que haya llegado a la administración.",
  };
}

function describeCreated(
  event: TicketTimelineEventInput,
): TicketEventDescription {
  if (event.actorType === "admin") {
    return { headline: `${event.actorLabel} cargó el reclamo`, detail: null };
  }
  if (event.actorType === "system") {
    return { headline: "El reclamo se creó automáticamente", detail: null };
  }
  return { headline: `${event.actorLabel} reportó el reclamo`, detail: null };
}

function describeStatusChanged(
  event: TicketTimelineEventInput,
): TicketEventDescription {
  const parsed = statusChangedPayloadSchema.safeParse(event.payload);
  if (!parsed.success) {
    return {
      headline: `${event.actorLabel} cambió el estado del reclamo`,
      detail: null,
    };
  }
  return {
    headline: `${event.actorLabel} cambió el estado de "${statusText(parsed.data.from)}" a "${statusText(parsed.data.to)}"`,
    detail: null,
  };
}

function describePriorityChanged(
  event: TicketTimelineEventInput,
): TicketEventDescription {
  const parsed = priorityChangedPayloadSchema.safeParse(event.payload);
  if (!parsed.success) {
    return {
      headline: `${event.actorLabel} cambió la prioridad del reclamo`,
      detail: null,
    };
  }
  return {
    headline: `${event.actorLabel} cambió la prioridad de "${priorityText(parsed.data.from)}" a "${priorityText(parsed.data.to)}"`,
    detail: null,
  };
}

function describeAssigned(
  event: TicketTimelineEventInput,
): TicketEventDescription {
  const parsed = assignedPayloadSchema.safeParse(event.payload);
  const assignee = parsed.success ? parsed.data.assignee : undefined;
  if (!assignee) {
    return {
      headline: `${event.actorLabel} quitó la asignación del reclamo`,
      detail: null,
    };
  }
  return {
    headline: `${event.actorLabel} asignó el reclamo a ${assignee}`,
    detail: null,
  };
}

function describeNoteAdded(
  event: TicketTimelineEventInput,
): TicketEventDescription {
  const parsed = noteAddedPayloadSchema.safeParse(event.payload);
  return {
    headline: `${event.actorLabel} agregó una nota`,
    detail: parsed.success ? parsed.data.note : null,
  };
}

function describeAttachmentAdded(
  event: TicketTimelineEventInput,
): TicketEventDescription {
  const parsed = attachmentAddedPayloadSchema.safeParse(event.payload);
  const filename = parsed.success ? parsed.data.originalFilename : undefined;
  return {
    headline: `${event.actorLabel} agregó un archivo adjunto`,
    detail: filename ?? null,
  };
}

function describeMergedIntoIncident(
  event: TicketTimelineEventInput,
): TicketEventDescription {
  const parsed = mergedIntoIncidentPayloadSchema.safeParse(event.payload);
  if (!parsed.success) {
    return {
      // "problema en común", no "incidente" -- ver CLAUDE.md > Glosario.
      headline: `${event.actorLabel} agrupó este reclamo con un problema en común`,
      detail: null,
    };
  }
  const { incidentTitle, reason } = parsed.data;
  return {
    headline:
      reason === "created"
        ? `${event.actorLabel} creó un problema en común a partir de este reclamo`
        : `${event.actorLabel} sumó este reclamo a un problema en común ya existente`,
    detail: incidentTitle,
  };
}

// Paso 7.4 -- fusión de dos incidentes (ver el comentario de
// incidentMergedPayloadSchema y el de incident_merged en ticket-events.ts
// para cuándo pasa esto exactamente). Texto DISTINTO de
// describeMergedIntoIncident a propósito: acá el ticket YA estaba
// agrupado, lo que cambió es que SU incidente se unió a otro, no que se
// agrupó por primera vez.
function describeIncidentMerged(
  event: TicketTimelineEventInput,
): TicketEventDescription {
  const parsed = incidentMergedPayloadSchema.safeParse(event.payload);
  if (!parsed.success) {
    return {
      headline: `${event.actorLabel} fusionó el problema en común de este reclamo con otro`,
      detail: null,
    };
  }
  return {
    headline: `${event.actorLabel} fusionó el problema en común de este reclamo con otro`,
    detail: `Ahora es parte de "${parsed.data.toIncidentTitle}".`,
  };
}

// Paso 7.2 -- detectAndFlagSimilarTickets() siempre escribe este evento
// con actorType "system" (primer escritor real de ese valor del enum, ver
// el comentario de ticket-events.ts). El headline no usa actorLabel a
// propósito, mismo criterio que el branch "system" de describeCreated.
function describeSimilarTicketDetected(
  event: TicketTimelineEventInput,
): TicketEventDescription {
  const parsed = similarTicketDetectedPayloadSchema.safeParse(event.payload);
  if (!parsed.success) {
    return {
      headline: "Se detectó un posible reclamo duplicado",
      detail: null,
    };
  }
  const percent = Math.round(parsed.data.similarity * 100);
  return {
    headline: `Posible duplicado detectado: ${parsed.data.candidatePublicCode}`,
    detail: `${percent}% de similitud con este reclamo.`,
  };
}

// Paso 7.3 -- el administrador resuelve un candidato desde el banner del
// detalle. Texto DISTINTO del de merged_into_incident a propósito ("marcó
// como posible duplicado", no "agrupó") -- aunque el botón que dispara
// esto se llama "Agrupar" (mismo verbo que el enunciado pide), este evento
// todavía NO agrupa nada de verdad: "grouped" acá solo es el estado de
// revisión del candidato, el incidente real recién lo arma el paso 7.4.
// Compartir la palabra "agrupó" con merged_into_incident hubiera sugerido
// que ya existe un problema en común armado, cosa que este paso
// explícitamente NO hace.
function describeSimilarTicketResolved(
  event: TicketTimelineEventInput,
  resolution: "grouped" | "discarded",
): TicketEventDescription {
  const parsed = similarTicketResolvedPayloadSchema.safeParse(event.payload);
  if (!parsed.success) {
    return {
      headline:
        resolution === "grouped"
          ? `${event.actorLabel} marcó este reclamo como posible duplicado`
          : `${event.actorLabel} descartó un posible duplicado`,
      detail: null,
    };
  }
  return {
    headline:
      resolution === "grouped"
        ? `${event.actorLabel} marcó este reclamo como posible duplicado de ${parsed.data.otherPublicCode}`
        : `${event.actorLabel} descartó a ${parsed.data.otherPublicCode} como posible duplicado`,
    detail: null,
  };
}

export function describeTicketEvent(
  event: TicketTimelineEventInput,
): TicketEventDescription {
  switch (event.type) {
    case "created":
      return describeCreated(event);
    case "status_changed":
      return describeStatusChanged(event);
    case "priority_changed":
      return describePriorityChanged(event);
    case "assigned":
      return describeAssigned(event);
    case "note_added":
      return describeNoteAdded(event);
    case "attachment_added":
      return describeAttachmentAdded(event);
    case "merged_into_incident":
      return describeMergedIntoIncident(event);
    case "whatsapp_handoff_opened":
      return describeWhatsappHandoff(event.actorLabel);
    case "similar_ticket_detected":
      return describeSimilarTicketDetected(event);
    case "similar_ticket_grouped":
      return describeSimilarTicketResolved(event, "grouped");
    case "similar_ticket_discarded":
      return describeSimilarTicketResolved(event, "discarded");
    case "incident_merged":
      return describeIncidentMerged(event);
  }
}
