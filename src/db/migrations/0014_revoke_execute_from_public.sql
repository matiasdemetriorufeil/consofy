-- Custom SQL migration file, put your code below! --
-- Corrige un intento fallido de la migración 0013: revocar EXECUTE de
-- "anon"/"authenticated" directamente no alcanzaba, porque ninguno de los
-- dos tenía un grant DIRECTO -- Postgres otorga EXECUTE sobre funciones
-- nuevas a PUBLIC automáticamente al crearlas (a diferencia de las tablas,
-- que no le otorgan nada a PUBLIC por default), y anon/authenticated lo
-- heredaban por ser miembros implícitos de PUBLIC, no por un grant propio.
-- Verificado contra pg_proc.proacl: el ACL de las dos funciones tenía una
-- entrada "=X/postgres" (el "=" al principio, sin nombre de rol, es cómo
-- Postgres representa un grant a PUBLIC). Revocar de PUBLIC quita el
-- acceso heredado de raíz.
REVOKE EXECUTE ON FUNCTION "public"."set_updated_at"() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."set_ticket_public_code"() FROM PUBLIC;

-- Mismo ajuste para DEFAULT PRIVILEGES: la 0013 ya revocó EXECUTE sobre
-- funciones futuras para anon/authenticated puntualmente, pero para
-- eliminar el mismo default-a-PUBLIC en cualquier función que creemos de
-- acá en adelante hace falta revocarlo de PUBLIC ahí también.
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
