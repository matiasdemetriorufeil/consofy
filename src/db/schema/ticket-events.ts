import {
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { denyAnonAuthenticated, idColumn } from "./_shared";
import { tickets } from "./tickets";

export const ticketEventType = pgEnum("ticket_event_type", [
  "created",
  "status_changed",
  "priority_changed",
  "assigned",
  "note_added",
  "attachment_added",
  "merged_into_incident",
  "whatsapp_handoff_opened",
  // Paso 7.2 -- lo escribe findSimilarTickets al detectar UN candidato con
  // similarity() >= al umbral configurado (0.20 por default, ver el
  // reporte del paso), disparado justo después del alta del ticket (paso
  // 5.5). UNO por candidato, no un evento resumen -- mismo criterio que
  // attachment_added (uno por archivo) y las acciones masivas del paso
  // 6.5 ("uno por reclamo actualizado, nunca un evento resumen").
  // actorType siempre "system" -- primer escritor real de ese valor del
  // enum (existía desde antes en ticket_event_actor_type, sin ningún
  // evento que lo usara todavía).
  "similar_ticket_detected",
  // Paso 7.3 -- el administrador resuelve un candidato pendiente desde el
  // banner del detalle. Dos valores, no uno solo con un campo "resolution"
  // en el payload: son dos hechos de negocio distintos ("esto SÍ es un
  // duplicado" vs. "esto NO es un duplicado"), y la línea de tiempo ya
  // tiene el precedente de separar hechos distintos en tipos distintos
  // (status_changed vs. priority_changed, no un "field_changed" genérico).
  // actorType siempre "admin" acá (a diferencia de similar_ticket_detected,
  // que es "system") -- resolver un candidato es una decisión humana, no
  // algo que corra solo. Se escribe UNA fila de cada tipo en CADA uno de
  // los dos tickets del par (ver actions.ts) -- mismo motivo que
  // similar_ticket_detected: cada reclamo tiene que poder explicar por su
  // cuenta, mirando SU propia línea de tiempo, qué pasó con esto.
  "similar_ticket_grouped",
  "similar_ticket_discarded",
  // Paso 7.4 -- SOLO cuando "Agrupar" (7.3) une dos INCIDENTES ya
  // existentes y distintos en uno solo (agrupación en cadena: A+B ya
  // habían formado un incidente, C+D otro, y recién ahora un candidato
  // conecta B con C). `merged_into_incident` (de arriba, ya existía desde
  // antes de este proyecto sin ningún escritor real) alcanza para los
  // otros dos casos de 7.4 ("se creó un incidente nuevo" / "este reclamo
  // se sumó a uno ya existente" -- un nuevo campo `reason` en su payload
  // los distingue, ver ticket-event-description.ts); la fusión de DOS
  // incidentes es un hecho de negocio distinto y más raro (nunca le pasa
  // a la mayoría de los tickets agrupados), por eso se separa en su
  // propio valor en vez de forzarlo adentro de merged_into_incident con
  // un tercer `reason`. Se escribe en CADA ticket que estaba en el
  // incidente PERDEDOR (reasignado al ganador) -- no solo en el par que
  // disparó la fusión -- porque esos son los tickets cuyo incident_id
  // realmente cambió.
  "incident_merged",
  // Paso 7.5 -- resolveIncidentAction (incidents/actions.ts) resuelve el
  // incidente y propaga la resolución a sus tickets asociados. Valor
  // DISTINTO de "status_changed" a propósito: la propagación es un hecho
  // de negocio distinto de que un administrador entre a ESTE reclamo
  // puntual y lo marque resuelto a mano -- un evento "status_changed" acá
  // sugeriría lo segundo, y la línea de tiempo tiene que dejar bien claro
  // que este reclamo se resolvió PORQUE se resolvió el problema en común
  // que lo agrupaba, no de forma individual. Se escribe SOLO en los
  // tickets que de verdad transicionaron (ver isValidStatusTransition en
  // ticket-actions-schema.ts) -- un ticket que ya estaba en un estado
  // terminal (resolved/closed/discarded) no recibe este evento, porque no
  // se le tocó nada.
  "resolved_by_incident",
  // Paso 11.4 -- el VECINO agrega información o fotos a un reclamo abierto
  // desde `/s/[token]` (addResidentUpdateAction, public-form/actions.ts).
  // `actorType` siempre "neighbor". DISTINTO de `note_added`, que es
  // exclusivo de las notas internas del administrador -- que el
  // administrador no confunda "esto lo escribió el vecino" con "esto lo
  // escribió mi equipo" es un requisito del paso. Payload:
  // `{ text: string | null, photoCount: number }` -- uno por cada envío
  // del vecino (texto y/o fotos juntos cuentan como un evento). Clasificado
  // como PÚBLICO en `public-form/public-timeline.ts` (es info que aportó el
  // propio vecino, no algo interno).
  "resident_update_added",
]);

export const ticketEventActorType = pgEnum("ticket_event_actor_type", [
  "neighbor",
  "admin",
  "system",
]);

export const ticketEvents = pgTable(
  "ticket_events",
  {
    id: idColumn(),
    // Denormalizado desde tickets.organization_id -- hace posible la FK
    // compuesta de abajo. Ver CLAUDE.md > Integridad entre organizaciones.
    organizationId: uuid("organization_id").notNull(),
    ticketId: uuid("ticket_id").notNull(),
    type: ticketEventType("type").notNull(),
    // Detalle específico de cada tipo de evento (ej. { from: "new", to:
    // "in_progress" } para status_changed). Forma libre a propósito: cada
    // tipo de evento define su propia forma y se valida con Zod en la capa
    // de aplicación al escribir, no con un CHECK en la base -- forzar un
    // shape único por CHECK para 8 tipos de evento distintos sería más
    // rígido que útil.
    payload: jsonb("payload").notNull().default({}),
    actorType: ticketEventActorType("actor_type").notNull(),
    // Snapshot de texto, no una FK a people ni a una futura tabla de
    // usuarios del panel: esta tabla es un log histórico -- si el nombre
    // de la persona o del administrador cambia después, el evento tiene
    // que seguir mostrando el nombre que tenía EN ESE MOMENTO, no el
    // actual. Por eso es texto congelado al momento del evento, coherente
    // con que toda la tabla es append-only (ver más abajo).
    actorLabel: text("actor_label").notNull(),
    // Solo created_at, sin usar el helper timestamps(): esta tabla es un
    // log append-only -- no se edita ni se borra nunca una vez escrita, así
    // que no lleva updated_at (nada la actualiza) ni deleted_at (nada la
    // borra, ni siquiera lógicamente: el historial de un reclamo no se
    // "da de baja" fila por fila). Por el mismo motivo tampoco lleva el
    // trigger set_updated_at: no tendría ningún UPDATE que disparar.
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.ticketId, t.organizationId],
      foreignColumns: [tickets.id, tickets.organizationId],
    }).onDelete("restrict"),
    // "Ver la línea de tiempo de este reclamo", en orden cronológico --
    // igual que ticket_attachments, no es una de las 4 consultas de
    // bandeja del punto 6 pero es la razón de ser de esta tabla.
    index("ticket_events_ticket_id_created_at_idx").on(t.ticketId, t.createdAt),
    denyAnonAuthenticated(),
  ],
).enableRLS();
