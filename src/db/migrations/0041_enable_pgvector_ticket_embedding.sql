-- Custom SQL migration file, put your code below! --
-- pgvector + embedding de tickets (paso 14.1, etapa 14: detección de
-- duplicados por embeddings). Mismo criterio que la migración 0022 de
-- pg_trgm: `drizzle-kit generate` no modela extensiones ni el índice HNSW,
-- así que el DDL va escrito a mano dentro de este archivo custom, y la
-- columna `embedding` NO se declara en src/db/schema/tickets.ts (queda como
-- objeto no gestionado por el schema DSL, igual que los índices GIN de
-- trigram de la 0022 y los triggers de base -- este proyecto usa
-- `generate` + `migrate`, nunca `push`/`pull`, así que un objeto ausente
-- del schema es simplemente invisible para `generate`, no se intenta
-- borrar).
--
-- Modelo y dimensión: `gemini-embedding-001` (Gemini API, free tier), con
-- `output_dimensionality: 768`. Ver CLAUDE.md > Detección de duplicados por
-- embeddings (paso 14.1) para el razonamiento completo y el camino de
-- upgrade a 1536.

-- Extensión en el esquema `extensions`, mismo esquema que pgcrypto/
-- uuid-ossp/pg_trgm/pg_stat_statements en este proyecto (confirmado contra
-- pg_extension antes de escribir esto) -- no en `public`, siguiendo la
-- práctica de Supabase de no ensuciar el esquema público con objetos de
-- extensión. El `search_path` de la conexión de migraciones ya incluye
-- `extensions` (`"$user", public, extensions`, confirmado con
-- `SHOW search_path`), así que el tipo `vector` resuelve sin calificar.
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
--> statement-breakpoint

-- Nullable, sin default: los reclamos que ya existen no tienen embedding
-- hasta que el backfill del paso 14.3 los procese, y un reclamo nuevo lo
-- recibe recién después de que el paso 14.2 llame a la API de embeddings
-- (fuera de la transacción de alta -- el embedding nunca puede bloquear ni
-- demorar que el reclamo se guarde). `vector(768)` = la dimensión de
-- salida elegida para gemini-embedding-001.
ALTER TABLE "tickets" ADD COLUMN "embedding" vector(768);
--> statement-breakpoint

-- Índice HNSW con operador de COSENO (`extensions.vector_cosine_ops`,
-- calificado con el esquema igual que la 0022 hace con `gin_trgm_ops`):
-- los embeddings de Gemini son de norma unitaria, así que coseno es la
-- métrica correcta para similitud semántica. 768 dimensiones entra
-- cómodo bajo el tope de 2000 dims que pgvector impone a los índices HNSW
-- sobre el tipo `vector` -- por eso no hace falta `halfvec` acá (ver el
-- camino de upgrade documentado en CLAUDE.md). Parámetros de construcción
-- (`m`, `ef_construction`) quedan en el default de pgvector (16 / 64):
-- con el volumen de reclamos de esta app alcanza de sobra, y se pueden
-- reconstruir con otros valores más adelante sin cambiar el esquema.
CREATE INDEX "tickets_embedding_hnsw_idx" ON "tickets" USING hnsw ("embedding" extensions.vector_cosine_ops);
