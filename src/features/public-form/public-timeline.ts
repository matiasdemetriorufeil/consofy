import { z } from "zod";

import type { ticketEvents } from "@/db/schema";

import { PUBLIC_TICKET_STATUS_LABEL } from "./status-lookup-schema";

// Línea de tiempo PÚBLICA de un reclamo (paso 11.2) -- lo que ve el vecino
// en `/s/[token]`. Archivo puro (sin `server-only`): se testea con Vitest.
// La lectura real de `ticket_events` la hace `getTicketByAttachmentsToken`
// (queries.ts, `server-only`, filtra por organización) -- el cliente anon
// NUNCA toca esa tabla (RLS deny-all, ver CLAUDE.md > Políticas RLS).

// -----------------------------------------------------------------------
// Qué tipos de evento son SEGUROS de mostrarle al vecino
// -----------------------------------------------------------------------
// Clasificación de los 13 valores de `ticket_event_type` (ver el reporte
// del paso 11.2 para el detalle y el motivo de cada uno). Regla: SOLO
// cambios de estado del PROPIO reclamo. Nada de notas internas, asignación,
// prioridad (concepto de triage interno), ni nada que nombre a otro
// reclamo o a un "problema en común" (incidente) por su título o su id.
//
// - `status_changed` -> SÍ. Es el corazón de "¿cómo viene mi reclamo?".
//   Payload = solo valores del enum de estado, se traducen con
//   PUBLIC_TICKET_STATUS_LABEL (paso 11.1).
// - `resolved_by_incident` -> SÍ, pero se muestra como un cambio de estado
//   común a "Resuelto": su payload trae `incidentId`/`incidentTitle`, que
//   NO se muestran (nombran un problema que puede involucrar a otras
//   unidades). El vecino solo necesita saber que se resolvió.
// - `created` -> es seguro, pero la creación se representa aparte, desde
//   `reported_at` (fecha de negocio, siempre presente), así que este tipo
//   NO entra en la query -- ver buildPublicTimeline.
//
// Todo el resto es INTERNO y queda afuera:
// - `note_added`, `assigned` -> texto libre interno (pedido explícito).
// - `priority_changed` -> triage interno, sin vocabulario público.
// - `whatsapp_handoff_opened` -> acción del propio vecino, no del trámite;
//   además necesita el descargo de R8. Fuera de una vista "simplificada".
// - `attachment_added` -> sin escritor real hoy; los adjuntos ya se
//   muestran en su galería.
// - `merged_into_incident`, `incident_merged`, `similar_ticket_detected`,
//   `similar_ticket_grouped`, `similar_ticket_discarded` -> todos nombran
//   a OTRO reclamo o incidente por su código/id interno.
export const PUBLIC_TIMELINE_EVENT_TYPES = [
  "status_changed",
  "resolved_by_incident",
] as const satisfies readonly (typeof ticketEvents.$inferSelect)["type"][];

export type PublicTimelineEventRow = {
  type: (typeof ticketEvents.$inferSelect)["type"];
  payload: unknown;
  createdAt: Date;
};

export type PublicTimelineEntry = {
  key: string;
  at: Date;
  text: string;
};

// El payload de `status_changed` sin shape garantizado por la base (ver el
// comentario de esa columna) -- se revalida acá antes de confiar en él,
// mismo criterio que describeTicketEvent (paso 6.3). Solo interesa `to`.
const statusChangedToSchema = z.object({
  to: z.enum(["new", "in_progress", "resolved", "closed", "discarded"]),
});

function describeEvent(row: PublicTimelineEventRow): string | null {
  if (row.type === "status_changed") {
    const parsed = statusChangedToSchema.safeParse(row.payload);
    if (!parsed.success) {
      return "El estado de tu reclamo cambió";
    }
    return `Tu reclamo pasó a «${PUBLIC_TICKET_STATUS_LABEL[parsed.data.to]}»`;
  }
  if (row.type === "resolved_by_incident") {
    // NO se nombra el incidente ni su id -- solo el hecho.
    return `Tu reclamo pasó a «${PUBLIC_TICKET_STATUS_LABEL.resolved}»`;
  }
  // Cualquier otro tipo que se haya colado: se ignora (defensa en
  // profundidad -- la query ya filtra a PUBLIC_TIMELINE_EVENT_TYPES).
  return null;
}

// Arma la línea de tiempo pública: SIEMPRE arranca con la creación (desde
// `reported_at`, así nunca queda vacía aunque el reclamo sea recién
// creado y no tenga ningún evento todavía), y sigue con los eventos
// seguros en orden cronológico.
export function buildPublicTimeline(
  reportedAt: Date,
  events: PublicTimelineEventRow[],
): PublicTimelineEntry[] {
  const entries: PublicTimelineEntry[] = [
    { key: "created", at: reportedAt, text: "Recibimos tu reclamo" },
  ];

  const rest = [...events]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((event, index): PublicTimelineEntry | null => {
      const text = describeEvent(event);
      return text
        ? {
            key: `e${index}-${event.createdAt.getTime()}`,
            at: event.createdAt,
            text,
          }
        : null;
    })
    .filter((entry): entry is PublicTimelineEntry => entry !== null);

  return [...entries, ...rest];
}
