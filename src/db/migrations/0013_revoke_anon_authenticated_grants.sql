-- Custom SQL migration file, put your code below! --
-- Segunda capa de defensa, además de la policy deny_anon_authenticated de
-- la migración 0012 (ver CLAUDE.md > Políticas RLS para el razonamiento
-- completo). Verificado contra la base real antes de escribir esto: el
-- setup de Supabase le da a anon/authenticated privilegios COMPLETOS
-- (arwdDxtm: SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER) sobre
-- toda tabla nueva del esquema public por default, y EXECUTE sobre toda
-- función nueva. RLS con policy deny-all ya bloquea a esos roles a nivel de
-- fila, pero el GRANT de tabla es una capa aparte, evaluada ANTES de que
-- Postgres llegue a mirar RLS: si alguna vez una tabla queda con RLS
-- deshabilitado por error (un DROP POLICY accidental, un ALTER TABLE ...
-- DISABLE ROW LEVEL SECURITY, un bug), el GRANT abierto por default sería
-- lo único que quedaría entre anon/authenticated y la tabla completa. Este
-- REVOKE cierra esa puerta de forma independiente: aunque RLS fallara,
-- Postgres seguiría rechazando con "permission denied" antes de llegar a
-- evaluar ninguna policy.

-- 1) Revocar los grants que ya existen sobre las 17 tablas actuales.
REVOKE ALL ON TABLE "public"."organizations" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."buildings" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."units" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."people" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."unit_occupancies" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."categories" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."incidents" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."tickets" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."ticket_attachments" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."ticket_events" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."ticket_code_counters" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."announcements" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."announcement_recipients" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."reminders" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."documents" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."notifications" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."health_check" FROM "anon", "authenticated";

-- 2) Revocar EXECUTE sobre las funciones existentes. Defensivo, no
-- explotable hoy: las dos son funciones de trigger (RETURNS trigger), que
-- Postgres ya rechaza invocar fuera de un trigger sin importar el grant --
-- pero no cuesta nada cerrarlo igual, y cubre cualquier función futura que
-- SÍ sea invocable si alguien olvida revocarla a mano.
REVOKE EXECUTE ON FUNCTION "public"."set_updated_at" FROM "anon", "authenticated";
REVOKE EXECUTE ON FUNCTION "public"."set_ticket_public_code" FROM "anon", "authenticated";

-- 3) Revocar la única secuencia existente (health_check usa serial, no
-- uuid -- es la excepción del esquema, ver health-check.ts).
REVOKE ALL ON SEQUENCE "public"."health_check_id_seq" FROM "anon", "authenticated";

-- 4) DEFAULT PRIVILEGES: sin esto, la tabla/función/secuencia de MAÑANA
-- nace otra vez con el default abierto de Supabase, exactamente el problema
-- que este REVOKE de arriba soluciona solo para lo que existe HOY. "FOR
-- ROLE postgres" porque es el rol con el que corren nuestras migraciones
-- (ver DATABASE_URL/MIGRATION_DATABASE_URL) -- todo objeto que creemos de
-- acá en adelante queda excluido de arwdDxtm/EXECUTE para anon/
-- authenticated desde el momento en que se crea, sin depender de acordarse
-- de escribir un REVOKE en cada migración nueva. Esto es aparte, y no
-- reemplaza, la policy deny-all por tabla: DEFAULT PRIVILEGES protege la
-- capa de grants para objetos futuros, no crea policies -- una tabla nueva
-- sigue necesitando su propio .enableRLS() (ya es la convención) y su
-- propia policy explícita si se quiere que el linter de Supabase no la
-- marque como "no access rules defined" (ver CLAUDE.md > Políticas RLS).
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
  REVOKE ALL ON TABLES FROM "anon", "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
  REVOKE EXECUTE ON FUNCTIONS FROM "anon", "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
  REVOKE ALL ON SEQUENCES FROM "anon", "authenticated";
