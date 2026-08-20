-- Custom SQL migration file, put your code below! --
-- pg_trgm (paso 6.1, bandeja de reclamos): se asumía habilitada desde la
-- etapa 2, pero al verificar contra la base real (pg_extension) resultó que
-- NO lo estaba -- ni en ninguna migración del repo ni en la base de
-- desarrollo. Se habilita acá, donde el primer uso real la necesita, en el
-- esquema `extensions` (mismo esquema que ya usan pgcrypto/uuid-ossp/
-- pg_stat_statements en este proyecto -- confirmado contra pg_extension
-- antes de escribir esto -- no en `public`, siguiendo la práctica que
-- Supabase ya usa acá para no ensuciar el esquema público con objetos de
-- extensión). `search_path` de la conexión de la app ya incluye
-- `extensions` (confirmado con `SHOW search_path`), así que los operadores
-- de trigram funcionan sin tener que calificarlos en cada query.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
--> statement-breakpoint

-- Índices GIN de trigram para la búsqueda de texto del listado de reclamos
-- (paso 6.1): potencian ILIKE '%término%' (substring, sin anclar al
-- principio del texto) sin escanear la tabla entera a medida que crece.
-- Con los 500 reclamos de la medición de este paso un sequential scan ya
-- es rápido de por sí (por eso la medición real no muestra una diferencia
-- dramática) -- el valor de estos índices es para cuando la cantidad de
-- reclamos crezca con los años, que es justo el escenario para el que
-- pg_trgm se dejó anticipado desde el plan.
CREATE INDEX "tickets_title_trgm_idx" ON "tickets" USING gin ("title" extensions.gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "tickets_description_trgm_idx" ON "tickets" USING gin ("description" extensions.gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "tickets_public_code_trgm_idx" ON "tickets" USING gin ("public_code" extensions.gin_trgm_ops);
--> statement-breakpoint

-- La búsqueda también cubre el nombre del vecino (ver
-- src/features/tickets/queries.ts, getTicketInbox) -- mismos índices sobre
-- people, que ya existe desde la etapa 4.
CREATE INDEX "people_first_name_trgm_idx" ON "people" USING gin ("first_name" extensions.gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "people_last_name_trgm_idx" ON "people" USING gin ("last_name" extensions.gin_trgm_ops);
