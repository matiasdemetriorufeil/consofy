-- Custom SQL migration file, put your code below! --
-- Mismo trigger reutilizable de la migración 0002 (con el search_path
-- fijo de la 0003) -- ticket_similarity_candidates SÍ se actualiza de
-- verdad (paso 7.3 cambia `status` de "pending" a "grouped"/"discarded"),
-- a diferencia de ticket_events (append-only, sin trigger). Ver el
-- comentario de `timestamps()` en ese archivo.
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON "ticket_similarity_candidates"
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
