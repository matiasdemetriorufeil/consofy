-- Custom SQL migration file, put your code below! --
-- El linter de Supabase marca las funciones sin search_path fijo como
-- vulnerables a "search_path mutable": sin esto, alguien con permiso para
-- crear objetos en algún esquema del search_path podría hacer que la
-- función resuelva un nombre no calificado (una tabla, un operador) contra
-- un objeto malicioso en vez del que corresponde. search_path = '' fuerza
-- a calificar todo explícitamente; pg_catalog (donde vive now()) siempre
-- se busca primero sin importar el search_path, así que la función no
-- necesita cambios más allá de esta línea.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
