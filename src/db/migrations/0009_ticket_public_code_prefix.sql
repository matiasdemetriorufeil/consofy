-- Custom SQL migration file, put your code below! --
-- Reescribe set_ticket_public_code() (creada en la migración 0007) para
-- que arme el código como PREFIJO-AÑO-NNNN en vez de TC-AÑO-NNNN global.
-- CREATE OR REPLACE FUNCTION reemplaza el cuerpo sin tocar el trigger BEFORE
-- INSERT ya creado en tickets (sigue apuntando al mismo nombre de función),
-- así que no hace falta recrear el trigger.
CREATE OR REPLACE FUNCTION set_ticket_public_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  building_prefix text;
  org_timezone text;
  ticket_year integer;
  next_value integer;
BEGIN
  -- Lookup simple (SELECT sin FOR UPDATE): una lectura MVCC no toma lock de
  -- fila en Postgres, así que no compite ni con otros inserts concurrentes
  -- de reclamos (mismo edificio o de otro) ni con el UPSERT del contador de
  -- más abajo. El único punto real de bloqueo sigue siendo ese UPSERT,
  -- acotado a (building_id, year) -- dos edificios distintos nunca esperan
  -- uno al otro, verificado con una prueba real de 50 inserts concurrentes
  -- repartidos entre dos edificios.
  --
  -- Se lee o.timezone (de la organización DUEÑA del edificio, vía JOIN
  -- desde b.organization_id) en vez de confiar en NEW.organization_id: la
  -- FK compuesta que valida que building_id y organization_id coincidan
  -- todavía no corrió en este punto (los triggers BEFORE INSERT se
  -- ejecutan antes de que Postgres verifique las FK de la fila), así que
  -- NEW.organization_id podría en teoría no coincidir con el edificio real
  -- si alguien la manipulara a mano -- leer el timezone a través del
  -- edificio efectivamente encontrado es la fuente correcta pase lo que
  -- pase después con esa FK.
  SELECT b.code_prefix, o.timezone
  INTO building_prefix, org_timezone
  FROM public.buildings b
  JOIN public.organizations o ON o.id = b.organization_id
  WHERE b.id = NEW.building_id;

  -- Zona horaria real de la organización, no una constante fija: ya hacía
  -- falta este JOIN para leer el prefijo del edificio, así que sumar
  -- o.timezone a la misma consulta no complica el trigger de forma real --
  -- la alternativa de "America/Argentina/Cordoba" fija hubiera sido más
  -- simple pero incorrecta para cualquier organización futura en otro huso
  -- horario (organizations.timezone ya existe desde el paso 1.1 justamente
  -- para esto). AT TIME ZONE acepta una expresión de texto además de un
  -- literal, así que la variable sirve directo.
  ticket_year := extract(year from (NEW.reported_at AT TIME ZONE org_timezone))::integer;

  INSERT INTO public.ticket_code_counters (building_id, year, last_value)
  VALUES (NEW.building_id, ticket_year, 1)
  ON CONFLICT (building_id, year)
  DO UPDATE SET last_value = public.ticket_code_counters.last_value + 1
  RETURNING last_value INTO next_value;

  NEW.public_code := building_prefix || '-' || ticket_year || '-' || lpad(next_value::text, 4, '0');
  RETURN NEW;
END;
$$;
