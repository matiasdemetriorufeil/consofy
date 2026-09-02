import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";

import type {
  ResolvedSimilarityCandidateRow,
  SimilarityResolution,
} from "./similarity-evaluation-summary";

// Consulta de la pantalla de evaluación de detección de duplicados (paso
// 14.5) -- SOLO LECTURA sobre datos históricos. No cambia el flujo de
// aceptar/rechazar del 7.3.
//
// Los tres scores NO están juntos en una sola fila:
//   - `combinedScore` vive en `ticket_similarity_candidates.similarity`
//     (real). Desde el 14.4 es el score combinado; antes era el de trigram.
//   - `trigramSimilarity` / `cosineSimilarity` viven SOLO en el payload
//     (jsonb) del evento `similar_ticket_detected`, y solo desde el 14.4.
// Por eso el LEFT JOIN al evento: un candidato anterior al 14.4 no tiene
// esas dos claves y sale con `null` en las dos -- exactamente lo que el
// enunciado anticipa.
//
// SQL crudo (`db.execute`) y no el query builder: hay dos self-joins sobre
// `tickets` (el reclamo nuevo y el candidato) más una extracción de JSON
// con cast, todo más claro escrito a mano -- mismo criterio que
// `detect-similar-tickets-on-create.ts`. El `organizationId` va como
// parámetro bindeado.
type Raw = {
  candidate_id: string;
  resolution: SimilarityResolution;
  resolved_at: Date;
  combined_score: number;
  trigram_similarity: number | null;
  cosine_similarity: number | null;
  new_public_code: string;
  new_title: string;
  old_public_code: string;
  old_title: string;
  building_name: string;
  category_name: string;
};

export async function getResolvedSimilarityCandidates(
  organizationId: string,
): Promise<ResolvedSimilarityCandidateRow[]> {
  const rows = await db.execute<Raw>(sql`
    select
      sc."id"                                        as candidate_id,
      sc."status"                                    as resolution,
      sc."updated_at"                                as resolved_at,
      sc."similarity"                                as combined_score,
      (ev."payload" ->> 'trigramSimilarity')::float8 as trigram_similarity,
      (ev."payload" ->> 'cosineSimilarity')::float8  as cosine_similarity,
      nt."public_code"                               as new_public_code,
      nt."title"                                     as new_title,
      ot."public_code"                               as old_public_code,
      ot."title"                                     as old_title,
      b."name"                                       as building_name,
      c."name"                                       as category_name
    from "ticket_similarity_candidates" sc
    join "tickets" nt
      on nt."id" = sc."ticket_id"
      and nt."organization_id" = sc."organization_id"
    join "tickets" ot
      on ot."id" = sc."candidate_ticket_id"
      and ot."organization_id" = sc."organization_id"
    join "buildings" b
      on b."id" = nt."building_id"
      and b."organization_id" = sc."organization_id"
    join "categories" c
      on c."id" = nt."category_id"
      and c."organization_id" = sc."organization_id"
    left join "ticket_events" ev
      on ev."ticket_id" = sc."ticket_id"
      and ev."organization_id" = sc."organization_id"
      and ev."type" = 'similar_ticket_detected'
      and ev."payload" ->> 'candidateTicketId' = sc."candidate_ticket_id"::text
    where sc."organization_id" = ${organizationId}
      and sc."status" in ('grouped', 'discarded')
      and sc."deleted_at" is null
    order by sc."updated_at" desc, sc."id"
  `);

  return rows.map((r) => ({
    candidateId: r.candidate_id,
    resolution: r.resolution,
    resolvedAt: new Date(r.resolved_at),
    combinedScore: Number(r.combined_score),
    trigramSimilarity:
      r.trigram_similarity === null ? null : Number(r.trigram_similarity),
    cosineSimilarity:
      r.cosine_similarity === null ? null : Number(r.cosine_similarity),
    newTicket: { publicCode: r.new_public_code, title: r.new_title },
    oldTicket: { publicCode: r.old_public_code, title: r.old_title },
    buildingName: r.building_name,
    categoryName: r.category_name,
  }));
}
