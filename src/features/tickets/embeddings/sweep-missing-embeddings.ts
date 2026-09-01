import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";

import { embedAndStoreTicket } from "./embed-ticket";

export type SweepMissingEmbeddingsResult =
  | { ok: true; processedCount: number; storedCount: number }
  | { ok: false; error: string };

// Cuántos reclamos sin embedding procesa el barrido POR CORRIDA (una vez
// al día, plegado a `runDailyCron`, paso 9.6).
//
// 25 -- el barrido es la RED DE SEGURIDAD para el reclamo cuyo intento en
// vivo (dentro de `after()`, tras el alta) falló de forma persistente:
// cuota agotada, corte de red largo, un 5xx sostenido de Gemini. El
// proyecto son tres edificios de Córdoba: se crean un puñado de reclamos
// por día (ver CLAUDE.md > Qué es este proyecto y el análisis de volumen
// del paso 5.11), y de esos, la fracción que ADEMÁS falla los 3 intentos
// en vivo es minúscula. 25/corrida drena cualquier acumulación realista de
// un día en una sola pasada, y aun corriendo los 25 seguidos (~10-15s de
// llamadas secuenciales) queda muy por debajo de cualquier límite por
// minuto. Si alguna vez hubiera un backlog más grande (un día entero de
// caída de Gemini), se drena en corridas sucesivas -- y el backfill masivo
// de los ~1.279 reclamos históricos NO es esto, es el paso 14.3, que se
// paga su propio ritmo.
const SWEEP_BATCH_SIZE = 25;

// Reprocesa hasta `SWEEP_BATCH_SIZE` reclamos de una organización que
// quedaron con `embedding IS NULL` (paso 14.2, frente 5 -- Opción A del
// arquitecto: `embedding IS NULL` como cola implícita, sin tabla ni
// contador nuevos). Llamado por `runDailyCron` una vez por organización.
//
// REGLA DURA (mismo patrón que `sweepOverdueTickets`/`sweepDueReminders`
// del 9.6 y que `detectAndFlagSimilarTickets` del 7.2): nunca propaga una
// excepción -- todo el cuerpo en un try/catch que loguea y devuelve
// `{ok: false}`, para que el orquestador del cron siga con las demás
// tareas pase lo que pase acá. `embedAndStoreTicket` YA tiene su propio
// try/catch interno, así que un reclamo que falla no corta el barrido de
// los demás de la misma corrida.
export async function sweepMissingTicketEmbeddings(
  organizationId: string,
): Promise<SweepMissingEmbeddingsResult> {
  try {
    // `tickets.embedding` no está en el schema DSL de Drizzle (14.1) -- SQL
    // crudo. Más nuevos primero: si hay backlog, que los reclamos
    // recientes (más probables de recibir un duplicado pronto) se
    // embeban antes.
    const rows = await db.execute<{
      id: string;
      description: string;
      category_name: string;
    }>(sql`
      select t."id", t."description", c."name" as category_name
      from "tickets" t
      join "categories" c
        on c."id" = t."category_id"
        and c."organization_id" = t."organization_id"
      where t."organization_id" = ${organizationId}
        and t."embedding" is null
        and t."deleted_at" is null
      order by t."reported_at" desc
      limit ${SWEEP_BATCH_SIZE}
    `);

    let storedCount = 0;
    for (const row of rows) {
      const result = await embedAndStoreTicket({
        ticketId: row.id,
        organizationId,
        categoryName: row.category_name,
        description: row.description,
      });
      if (result.ok && result.stored) {
        storedCount += 1;
      }
    }

    return { ok: true, processedCount: rows.length, storedCount };
  } catch (error) {
    console.error(
      `[sweepMissingTicketEmbeddings] Falló el barrido de embeddings faltantes para la organización ${organizationId}:`,
      error,
    );
    return { ok: false, error: String(error) };
  }
}
