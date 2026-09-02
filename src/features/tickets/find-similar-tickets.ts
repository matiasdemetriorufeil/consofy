import "server-only";

import { and, desc, eq, inArray, isNull, ne, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { tickets } from "@/db/schema";

import {
  ACCENTED_CHARS,
  normalizeTicketText,
  PLAIN_CHARS,
} from "./normalize-ticket-text";
import {
  combineSimilarityScores,
  VECTOR_CANDIDATE_LIMIT,
} from "./hybrid-similarity";
import { PENDING_STATUSES, type Status } from "./queries";
import { getBuildingSimilarityConfig } from "./similarity-config";

// Dimensión del vector de `tickets.embedding` -- fijada en el paso 14.1
// (`vector(768)`, gemini-embedding-001 truncado con MRL). Local acá para
// no arrastrar el cliente de la API de Gemini (`embeddings/gemini-embedding.ts`,
// con su `env.GEMINI_API_KEY`) al grafo de este módulo solo por una
// constante.
const EMBEDDING_DIMENSIONS = 768;

// Detección de reclamos repetidos (paso 7.1) -- ESTE paso construye
// solamente el servicio, testeable de forma aislada; no se conecta
// todavía al alta de un ticket (eso es el paso 7.2, que decide qué hacer
// con el resultado: avisar al administrador, sugerir agrupar en un
// incidente, etc.).
//
// Firma elegida -- función "casi pura" con parámetros explícitos
// (buildingId, categoryId, title, description, excludeTicketId), NO
// findSimilarTickets(ticketId): el paso 7.2 va a necesitar llamar a esto
// ANTES de insertar el reclamo nuevo (mientras el vecino todavía está
// completando el formulario, o justo antes de guardarlo), momento en el
// que ese ticket todavía no existe como fila -- una firma que exigiera un
// id ya guardado no serviría para ese caso real, que es el motivo de ser
// de esta función. Como ventaja secundaria, así es trivial de probar en
// aislamiento (paso 7.1 lo pide explícitamente "testeable de forma
// aislada"): no hace falta insertar un ticket real primero para verificar
// qué candidatos devuelve.

// Paso 7.6 -- la ventana default (72 horas, mismo valor ya usado en el
// seed para armar el cluster de 4 reclamos del ascensor, ver
// src/db/seed.ts) dejó de ser una constante hardcodeada acá: ahora vive
// por EDIFICIO (`buildings.similarity_window_hours`, con 72 como default
// de columna -- ningún edificio existente cambia de comportamiento al
// migrar). `DEFAULT_SIMILARITY_WINDOW_HOURS` (re-exportada de
// similarity-config.ts) sigue existiendo como fallback defensivo si el
// edificio no resolviera, no como el valor real que usa la mayoría de las
// llamadas.
export { DEFAULT_SIMILARITY_WINDOW_HOURS as DEFAULT_SIMILAR_TICKETS_WINDOW_HOURS } from "./similarity-config";

// normalizeTicketText/ACCENTED_CHARS/PLAIN_CHARS viven en
// normalize-ticket-text.ts (archivo aparte, sin `import "server-only"`) --
// ver el comentario de ese archivo sobre por qué. Reexportada acá para que
// un caller que ya importa este módulo no necesite un segundo import
// aparte solo para la función de normalización -- pero cualquier test que
// SOLO necesite normalizeTicketText tiene que importarla directo de
// normalize-ticket-text.ts, nunca de acá (importar CUALQUIER cosa de este
// archivo ejecuta `import "server-only"` de la línea 1).
export { normalizeTicketText };

// Mismo algoritmo que normalizeTicketText(), del lado de SQL -- lower(),
// translate() con el mismo mapeo de 7 caracteres, trim() y
// regexp_replace() para colapsar espacios, en ese orden.
//
// `'\\s+'`, con la barra invertida DUPLICADA en el código fuente -- no es
// un capricho de estilo. Encontrado probando este mismo paso: un template
// literal de JS (el `sql\`...\`` de Drizzle) resuelve escapes ANTES de que
// Drizzle vea el string -- `\s` no es una secuencia de escape reconocida
// por JS, así que en un string/template literal común el backslash se
// descarta en silencio y `'\s+'` le llega a Postgres como `'s+'` (un
// patrón que borra cada 's' suelta del texto, no los espacios). Probado en
// la práctica contra la base real ANTES de este fix: "ascensor" salía
// convertido en "a cen or". `'\\s+'` es lo que hace que Postgres reciba
// el backslash real que necesita `\s+` como clase de espacio en su regex.
function normalizedColumnSql(
  column: typeof tickets.title | typeof tickets.description,
): SQL {
  return sql`regexp_replace(trim(translate(lower(${column}), ${ACCENTED_CHARS}, ${PLAIN_CHARS})), '\\s+', ' ', 'g')`;
}

export type SimilarTicketCandidate = {
  id: string;
  publicCode: string;
  title: string;
  description: string;
  status: Status;
  reportedAt: Date;
  // Score LÉXICO crudo -- `similarity()` de pg_trgm sobre el texto
  // normalizado (paso 7.1).
  trigramSimilarity: number;
  // Score SEMÁNTICO crudo -- coseno entre embeddings normalizados
  // (1 - distancia `<=>`, índice HNSW, paso 14.4). `null` si el candidato
  // no tiene embedding todavía (histórico sin backfillear -- el arquitecto
  // decidió no backfillear en el 14.4 --, o el `referenceEmbedding` del
  // reclamo de referencia no está disponible): ese par se compara solo por
  // trigram, comportamiento esperado.
  cosineSimilarity: number | null;
  // Score COMBINADO en [0, 1] -- `max` de las dos métricas reescaladas
  // contra su propio umbral (ver hybrid-similarity.ts). Es el número sobre
  // el que decide `detectAndFlagSimilarTickets` (paso 14.4).
  combinedScore: number;
  // Alias de `combinedScore` -- "el score sobre el que se actúa". Se
  // mantiene el nombre `similarity` para no romper consumidores previos al
  // 14.4 (antes era el score de trigram; ahora es el combinado).
  similarity: number;
};

export type FindSimilarTicketsParams = {
  buildingId: string;
  categoryId: string;
  title: string;
  description: string;
  // Al comparar un ticket YA EXISTENTE contra el resto (ej. una pantalla
  // de administración que muestra "reclamos parecidos a este"), para que
  // no se compare consigo mismo. Ausente en el caso de uso real del paso
  // 7.2 (un ticket nuevo, todavía sin id).
  excludeTicketId?: string;
  // "Ahora" por default -- el caso real (paso 7.2) es comparar un ticket
  // que se está por crear, reportado en este mismo instante. Parametrizado
  // para que la verificación de este paso pueda fijar un instante
  // concreto y así probar la ventana de 72hs contra timestamps reales del
  // seed, sin depender de qué hora es "ahora" cuando se corre la prueba.
  referenceReportedAt?: Date;
  windowHours?: number;
  // Paso 14.4 -- embedding YA NORMALIZADO (768 dims) del texto de
  // referencia. Cuando está presente, se corre además la consulta
  // vectorial (índice HNSW, coseno) y cada candidato recibe su
  // `cosineSimilarity` + `combinedScore`. Cuando falta (el reclamo de
  // referencia todavía no tiene embedding, o el caller no lo calculó), la
  // función se comporta igual que antes del 14.4: solo trigram, y
  // `cosineSimilarity` queda `null` en todos los candidatos.
  referenceEmbedding?: number[];
  // Umbral de trigram POR EDIFICIO (paso 7.6). Default: el configurado
  // para el edificio. Explícito para los tests y para que
  // `detectAndFlagSimilarTickets`, que ya lee la config, no fuerce una
  // segunda consulta.
  trigramThreshold?: number;
  // Umbral de coseno. Default: `DEFAULT_COSINE_SIMILARITY_THRESHOLD`
  // (0.78, punto de partida para el 14.5).
  cosineThreshold?: number;
};

// Busca reclamos ABIERTOS (new/in_progress -- PENDING_STATUSES, ver
// queries.ts; resolved/closed/discarded quedan afuera a propósito: un
// reclamo ya resuelto no es un duplicado activo que amerite agruparse) del
// MISMO edificio y la MISMA categoría, dentro de la ventana temporal
// (default 72hs, simétrica: pasado Y futuro respecto de
// referenceReportedAt -- ver el comentario de esa ventana en el reporte
// del paso), ordenados por similitud de texto real (pg_trgm
// `similarity()`, no el operador `%` -- el enunciado pide el score
// numérico, no un booleano).
//
// `organizationId` SIEMPRE primer parámetro, obligatorio -- mismo patrón
// que el resto de las queries de dominio (ver CLAUDE.md > Acceso a datos):
// aunque buildingId/categoryId ya acotan mucho, el filtro de organización
// va IGUAL en el WHERE, nunca confiado a que el caller ya validó el
// edificio/categoría contra la organización correcta antes de llamar acá.
//
// Título + descripción CONCATENADOS (normalizados) en un solo texto de
// comparación, no dos scores separados: un texto más largo le da a
// pg_trgm más trigramas para trabajar (menos ruido que comparar títulos
// cortos sueltos, que con 3-6 palabras dan scores más inestables), y el
// enunciado pide "el score real" en singular, no dos números que el
// caller tendría que combinar por su cuenta.
//
// Ningún índice GIN nuevo: los que ya existen sobre `tickets.title`/
// `tickets.description` (migración de pg_trgm, paso 6.1) son sobre las
// columnas CRUDAS, no sobre el texto normalizado -- no aceleran esta
// consulta tal cual. Se evaluó agregar un índice funcional sobre la
// expresión normalizada y se descartó: esta consulta filtra PRIMERO por
// organización + edificio + categoría + estado + ventana (con los índices
// btree que ya existen, `tickets_building_id_category_id_reported_at_idx`
// y `tickets_building_id_status_reported_at_idx`), y RECIÉN calcula
// similarity() sobre ese conjunto ya angosto -- un edificio+categoría+72hs
// tiene, en la práctica, un puñado de reclamos (ver la medición del
// reporte del paso, EXPLAIN ANALYZE con los datos reales del seed). Un GIN
// trigram acelera un `%`/similarity() cuando hace falta escanear TODA la
// tabla (el caso de la búsqueda libre del paso 6.1); acá nunca se llega a
// escanear la tabla completa.
//
// Paso 14.4 -- BÚSQUEDA HÍBRIDA. Cuando el caller pasa `referenceEmbedding`,
// se corre además una SEGUNDA consulta: los K vecinos más cercanos por
// embedding (`ORDER BY embedding <=> ref LIMIT K`, operador de coseno del
// índice `tickets_embedding_hnsw_idx`, paso 14.1), REUSANDO el mismo array
// `conditions` de arriba (mismo edificio + categoría + estado + ventana +
// exclusión) -- el alcance no se duplica. Cada candidato del trigram
// recibe entonces su `cosineSimilarity` y un `combinedScore`
// (`hybrid-similarity.ts`). Sobre el conjunto ya angosto que deja el
// filtro btree, Postgres resuelve la distancia de forma EXACTA (sin usar
// HNSW, y sin `Seq Scan` de la tabla) -- que es lo óptimo con un puñado de
// filas. El HNSW gana relevancia (y el planner lo elige) cuando ese
// conjunto crece: es la red para escala, no dead weight. Ver el EXPLAIN
// ANALYZE de las dos formas en el reporte del paso.
export async function findSimilarTickets(
  organizationId: string,
  params: FindSimilarTicketsParams,
): Promise<SimilarTicketCandidate[]> {
  // Paso 7.6 + 14.4 -- una sola lectura de la config del edificio, se usan
  // los dos campos: `windowHours` (default de la ventana) y `threshold`
  // (la barra de trigram POR EDIFICIO, que el 14.4 usa para reescalar ese
  // score antes de combinarlo con el de coseno). Cada uno con su fallback
  // explícito por parámetro (los tests / callers que fijan un valor
  // concreto). El costo -- una consulta PK indexada -- ya lo asumía el
  // paso 7.6 para `windowHours`; el 14.4 no agrega round-trips.
  const buildingConfig = await getBuildingSimilarityConfig(
    organizationId,
    params.buildingId,
  );
  const windowHours = params.windowHours ?? buildingConfig.windowHours;
  const trigramThreshold = params.trigramThreshold ?? buildingConfig.threshold;
  const referenceReportedAt = params.referenceReportedAt ?? new Date();
  // .toISOString(), no el Date crudo interpolado en el fragmento sql`` --
  // mismo motivo ya documentado en getAttentionTickets (queries.ts): el
  // driver no serializa un Date suelto dentro de un sql`` a mano, hay que
  // pasarlo como string.
  const referenceReportedAtIso = referenceReportedAt.toISOString();
  const referenceText = `${normalizeTicketText(params.title)} ${normalizeTicketText(params.description)}`;

  const candidateTextSql = sql`(${normalizedColumnSql(tickets.title)} || ' ' || ${normalizedColumnSql(tickets.description)})`;
  const similaritySql =
    sql<number>`similarity(${candidateTextSql}, ${referenceText})`.mapWith(
      Number,
    );

  const conditions = [
    eq(tickets.organizationId, organizationId),
    isNull(tickets.deletedAt),
    eq(tickets.buildingId, params.buildingId),
    eq(tickets.categoryId, params.categoryId),
    inArray(tickets.status, PENDING_STATUSES),
    params.excludeTicketId ? ne(tickets.id, params.excludeTicketId) : undefined,
    // Ventana SIMÉTRICA (valor absoluto): un candidato puede estar antes O
    // después de referenceReportedAt. El caso de uso real (paso 7.2, un
    // ticket que se está por crear "ahora") solo va a encontrar
    // candidatos en el pasado -- pero la simetría es lo que permite probar
    // esta función contra pares de tickets YA existentes (como el cluster
    // del seed) sin importar cuál de los dos se pasa como "referencia".
    sql`abs(extract(epoch from (${tickets.reportedAt} - ${referenceReportedAtIso}::timestamptz))) <= ${windowHours * 3600}`,
  ];

  const trigramRows = await db
    .select({
      id: tickets.id,
      publicCode: tickets.publicCode,
      title: tickets.title,
      description: tickets.description,
      status: tickets.status,
      reportedAt: tickets.reportedAt,
      trigramSimilarity: similaritySql,
    })
    .from(tickets)
    .where(and(...conditions))
    .orderBy(desc(similaritySql));

  // Paso 14.4 -- consulta vectorial. Solo si hay un embedding de
  // referencia (ver FindSimilarTicketsParams.referenceEmbedding). REUSA el
  // mismo `conditions` (el alcance no se duplica) + `embedding IS NOT
  // NULL`, y pide los K más cercanos por distancia de coseno. Esta forma
  // -- `ORDER BY embedding <=> ref LIMIT K` -- es la que el índice HNSW
  // sabe resolver. `OPERATOR(extensions.<=>)` calificado con el esquema,
  // igual que la 0022 hace con `gin_trgm_ops` y la 0041 con
  // `vector_cosine_ops` (Supabase no instala extensiones en `public`).
  const cosineByTicketId = new Map<string, number>();
  if (params.referenceEmbedding && params.referenceEmbedding.length > 0) {
    const referenceLiteral = `[${params.referenceEmbedding.join(",")}]`;
    const referenceVectorSql = sql`${referenceLiteral}::vector(${sql.raw(String(EMBEDDING_DIMENSIONS))})`;
    const distanceSql = sql`"tickets"."embedding" OPERATOR(extensions.<=>) ${referenceVectorSql}`;

    const vectorRows = await db
      .select({
        id: tickets.id,
        // 1 - distancia de coseno = similitud de coseno. Con vectores
        // normalizados a norma unitaria (paso 14.2) cae en la práctica en
        // [0, 1].
        cosineSimilarity: sql<number>`1 - (${distanceSql})`.mapWith(Number),
      })
      .from(tickets)
      .where(and(...conditions, sql`"tickets"."embedding" is not null`))
      .orderBy(sql`${distanceSql} asc`)
      .limit(VECTOR_CANDIDATE_LIMIT);

    for (const row of vectorRows) {
      cosineByTicketId.set(row.id, row.cosineSimilarity);
    }
  }

  // Merge: el universo de candidatos es el del trigram (sin umbral ni
  // límite, trae TODO el alcance). La consulta vectorial es un subconjunto
  // (mismo alcance + `embedding IS NOT NULL` + LIMIT K) que solo aporta el
  // número de coseno. Un candidato sin fila en `cosineByTicketId` ->
  // `cosineSimilarity: null` -> se compara solo por trigram.
  const candidates: SimilarTicketCandidate[] = trigramRows.map((row) => {
    const cosineSimilarity = cosineByTicketId.get(row.id) ?? null;
    const combinedScore = combineSimilarityScores({
      trigramSimilarity: row.trigramSimilarity,
      cosineSimilarity,
      trigramThreshold,
      cosineThreshold: params.cosineThreshold,
    });
    return {
      id: row.id,
      publicCode: row.publicCode,
      title: row.title,
      description: row.description,
      status: row.status,
      reportedAt: row.reportedAt,
      trigramSimilarity: row.trigramSimilarity,
      cosineSimilarity,
      combinedScore,
      similarity: combinedScore,
    };
  });

  candidates.sort((a, b) => b.combinedScore - a.combinedScore);
  return candidates;
}
