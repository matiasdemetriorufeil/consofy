import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  real,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { denyAnonAuthenticated, idColumn, timestamps } from "./_shared";
import { organizations } from "./organizations";
import { tickets } from "./tickets";

// Estado de revisión de UN candidato puntual (paso 7.2/7.3) -- "pending"
// es el default al detectar (7.2); "grouped"/"discarded" los pone el
// administrador desde el banner del detalle (7.3, no construido en este
// paso). Valores en inglés (dato de base, no UI) -- ver CLAUDE.md >
// Glosario, mismo criterio que ticket_status.
export const ticketSimilarityStatus = pgEnum("ticket_similarity_status", [
  "pending",
  "grouped",
  "discarded",
]);

// Tabla nueva, no una columna en `tickets` -- decisión del paso 7.2.
// Se evaluaron las dos formas contra lo que el propio enunciado pide que
// soporte el 7.3 ("más de un candidato por ticket, cada uno con su score
// real, y un estado de revisión que se pueda cambiar por candidato"):
//
// - Una columna en `tickets` (ej. `similar_to_ticket_id` +
//   `similarity_score`) solo alcanza para UN candidato -- el cluster real
//   del ascensor (paso 7.1) ya prueba que un ticket nuevo puede matchear
//   con VARIOS candidatos a la vez (hasta 3, en ese cluster de 4). Una
//   columna se quedaría corta el día uno, no en un caso límite futuro.
// - Una tabla puente permite N filas por ticket (una por candidato), cada
//   una con su propio `similarity` y su propio `status` -- exactamente
//   "pendiente/agrupado/descartado" POR CANDIDATO, no un solo estado
//   global para todos los candidatos de un ticket (dos candidatos del
//   mismo ticket pueden resolverse distinto: uno se agrupa, el otro se
//   descarta).
//
// Referencia DOS entidades `tickets` a la vez (el ticket nuevo Y el
// candidato existente) -- lleva su propia `organization_id` denormalizada
// y DOS FK compuestas hacia `tickets(id, organization_id)`, mismo patrón
// que exige CLAUDE.md > Integridad entre organizaciones para cualquier
// tabla que referencie más de una entidad de negocio a la vez.
export const ticketSimilarityCandidates = pgTable(
  "ticket_similarity_candidates",
  {
    id: idColumn(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    // El ticket RECIÉN CREADO que disparó la detección (paso 7.2) -- el
    // "nuevo" en la relación.
    ticketId: uuid("ticket_id").notNull(),
    // El ticket YA EXISTENTE que salió como candidato a duplicado -- el
    // "viejo" en la relación. Nombrado distinto de `ticketId` a propósito
    // (no `ticketAId`/`ticketBId`): la relación NO es simétrica -- el
    // 7.3 muestra "posible duplicado de X" en el detalle del ticket
    // NUEVO, señalando al VIEJO como X.
    candidateTicketId: uuid("candidate_ticket_id").notNull(),
    // Salida cruda de similarity() de pg_trgm (paso 7.1) -- real (float4),
    // el mismo tipo que devuelve la función en Postgres, sin redondear ni
    // convertir. "El score real, no solo un booleano" -- pedido explícito
    // del 7.1, que este paso persiste tal cual.
    similarity: real("similarity").notNull(),
    status: ticketSimilarityStatus("status").notNull().default("pending"),
    // NO es append-only como ticket_events -- a diferencia de ese log, acá
    // SÍ hay una mutación real y esperada (el 7.3 cambia `status` de
    // "pending" a "grouped"/"discarded"), así que lleva updated_at (con su
    // trigger set_updated_at) y deleted_at -- mismo razonamiento que ya
    // documenta `notifications.ts` para `read_at` frente a `ticket_events`
    // (una fila que pasa de estado, no un log de eventos nuevos).
    ...timestamps(),
  },
  (t) => [
    foreignKey({
      columns: [t.ticketId, t.organizationId],
      foreignColumns: [tickets.id, tickets.organizationId],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.candidateTicketId, t.organizationId],
      foreignColumns: [tickets.id, tickets.organizationId],
    }).onDelete("restrict"),
    // Un mismo par (ticket, candidato) ACTIVO no se inserta dos veces --
    // la detección del 7.2 corre UNA vez por alta, así que en la práctica
    // nunca debería chocar, pero el índice lo hace estructuralmente
    // imposible en vez de "confiado a que el código nunca llame dos
    // veces". Columna líder `ticket_id`: sirve además como índice para
    // "candidatos de este ticket" (7.3), la consulta real de esta tabla.
    //
    // PARCIAL (WHERE deleted_at IS NULL), no una constraint UNIQUE plana
    // -- corrección sobre la primera versión de este paso, que usaba
    // `unique(...)` (una constraint, que Postgres NO permite hacer
    // parcial: un UNIQUE de tabla no acepta WHERE, solo un ÍNDICE único
    // sí). Mismo patrón ya establecido en el proyecto para toda tabla con
    // `deleted_at` + unicidad (ver `people_organization_id_phone_e164_unique`
    // en people.ts, o el slug/code_prefix de buildings.ts): un par ya
    // usado por una fila SOFT-BORRADA no tiene que bloquear reinsertar el
    // mismo par -- la fila borrada "se fue del sistema" (ver CLAUDE.md >
    // Convenciones, `deleted_at` como papelera), no debería seguir
    // ocupando la unicidad para siempre. `public_token` de `buildings` es
    // la única excepción documentada a esta regla (una credencial de URL
    // pública, que no se reutiliza aunque el edificio esté de baja) -- no
    // aplica acá, esto es una relación entre tickets, no una credencial.
    uniqueIndex("ticket_similarity_candidates_ticket_candidate_unique")
      .on(t.ticketId, t.candidateTicketId)
      .where(sql`${t.deletedAt} is null`),
    // "Candidatos pendientes de toda la organización" -- no es una
    // consulta de este paso (7.2 solo inserta), pero es la forma obvia en
    // que 7.3 o un futuro dashboard va a querer listarlos; mismo criterio
    // ya usado en notifications_organization_id_unread_idx (parcial sobre
    // el estado "activo").
    index("ticket_similarity_candidates_organization_id_pending_idx")
      .on(t.organizationId)
      .where(sql`${t.status} = 'pending'`),
    // El banner del detalle (paso 7.3) busca en las DOS direcciones: este
    // ticket como `ticket_id` (cubierto por el índice único de arriba,
    // que ya tiene `ticket_id` como columna líder) O como
    // `candidate_ticket_id` (el caso "otro ticket se parece A ESTE") --
    // sin este índice, esa segunda dirección haría Seq Scan. Parcial sobre
    // `pending` por el mismo motivo que el índice de organización: es la
    // única consulta real (el banner solo muestra candidatos pendientes).
    index("ticket_similarity_candidates_candidate_ticket_id_pending_idx")
      .on(t.candidateTicketId)
      .where(sql`${t.status} = 'pending'`),
    // Invariantes que propongo, mismo criterio que las de tickets.ts:
    check(
      "ticket_similarity_candidates_not_self",
      sql`${t.ticketId} != ${t.candidateTicketId}`,
    ),
    check(
      "ticket_similarity_candidates_similarity_range",
      sql`${t.similarity} >= 0 and ${t.similarity} <= 1`,
    ),
    denyAnonAuthenticated(),
  ],
).enableRLS();
