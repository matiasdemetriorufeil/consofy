-- Custom SQL migration file, put your code below! --
-- Generación de tickets.public_code (formato "TC-2026-0143"): un UPSERT
-- atómico sobre ticket_code_counters por cada reclamo insertado.
--
-- Por qué UPSERT (INSERT ... ON CONFLICT DO UPDATE) y no un SELECT
-- MAX(...)+1: SELECT MAX()+1 lee un valor y lo escribe en dos pasos
-- separados -- dos transacciones concurrentes pueden leer el mismo MAX
-- antes de que ninguna escriba, y las dos calculan el mismo "siguiente"
-- número. El UPSERT es una sola sentencia: Postgres toma un lock de fila
-- sobre la clave en conflicto (year) durante toda la sentencia, así que
-- una segunda transacción que intente el mismo UPSERT para el mismo año
-- espera a que la primera termine (haga commit o rollback) antes de leer
-- last_value -- nunca puede leer el valor viejo y calcular el mismo
-- siguiente número. Duplicados quedan estructuralmente excluidos, no solo
-- "improbables".
--
-- Por qué una tabla de contador y no una SEQUENCE de Postgres: una
-- sequence nunca bloquea (más throughput bajo concurrencia), pero
-- nextval() NO participa de la transacción que la llama -- si el INSERT
-- del reclamo falla o hace rollback, el número ya consumido de la
-- sequence se pierde para siempre (hueco). Esta tabla, en cambio, se
-- actualiza con un UPDATE normal dentro de la misma transacción que el
-- INSERT del reclamo (mismo trigger, misma transacción): si esa
-- transacción hace rollback, el incremento se deshace con ella -- sin
-- huecos por transacciones abortadas. El costo es el opuesto: los inserts
-- concurrentes DEL MISMO AÑO se serializan brevemente sobre esa fila en
-- vez de nunca bloquearse. Para el volumen de reclamos esperado en esta
-- app (nunca miles simultáneos sobre el mismo año) es insignificante, y a
-- cambio no genera huecos. Una sequence tampoco resetea sola cada año sin
-- crear un objeto nuevo por año vía DDL dinámica -- otra razón para
-- preferir filas de una tabla común, mucho más simple de operar.
--
-- Por qué no generación aleatoria (ej. sufijo de 4 dígitos al azar con
-- reintento si choca): con un espacio de 10000 valores por año, la
-- probabilidad de colisión deja de ser despreciable bastante rápido
-- (problema del cumpleaños) y hace falta un loop de reintento; además no
-- da la numeración secuencial y legible ("van 143 reclamos este año") que
-- sí da un contador, que es justamente lo que un código legible busca
-- transmitir.
--
-- SET search_path = '' (no 'public'): mismo motivo que set_updated_at en
-- la migración 0003 -- evita que la función resuelva un nombre no
-- calificado contra un objeto inyectado en algún esquema del search_path.
-- Por eso ticket_code_counters se referencia calificado (public.*) acá
-- adentro.
CREATE OR REPLACE FUNCTION set_ticket_public_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  ticket_year integer;
  next_value integer;
BEGIN
  -- AT TIME ZONE 'utc' explícito: extract(year from timestamptz) sin esto
  -- depende del timezone de la sesión actual, no del valor almacenado.
  -- Como toda la app guarda en UTC (ver CLAUDE.md > Convenciones), el año
  -- del código tiene que calcularse en UTC sin importar qué timezone tenga
  -- configurada la sesión que dispara el INSERT.
  ticket_year := extract(year from (NEW.reported_at AT TIME ZONE 'utc'))::integer;

  INSERT INTO public.ticket_code_counters (year, last_value)
  VALUES (ticket_year, 1)
  ON CONFLICT (year)
  DO UPDATE SET last_value = public.ticket_code_counters.last_value + 1
  RETURNING last_value INTO next_value;

  NEW.public_code := 'TC-' || ticket_year || '-' || lpad(next_value::text, 4, '0');
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER set_ticket_public_code
BEFORE INSERT ON "tickets"
FOR EACH ROW
EXECUTE FUNCTION set_ticket_public_code();
--> statement-breakpoint
-- Mismo trigger reutilizable de la migración 0002 (con el search_path fijo
-- de la 0003), aplicado a las tres tablas nuevas que sí llevan
-- updated_at. ticket_events queda afuera a propósito -- no tiene columna
-- updated_at (ver el comentario en su schema).
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON "categories"
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON "tickets"
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON "ticket_attachments"
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
