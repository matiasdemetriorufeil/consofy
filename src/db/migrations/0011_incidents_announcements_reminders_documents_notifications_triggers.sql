-- Custom SQL migration file, put your code below! --
-- Mismo trigger reutilizable de la migración 0002 (con el search_path fijo
-- de la 0003), aplicado a las 6 tablas nuevas de este paso que llevan
-- updated_at. announcement_recipients incluida: aunque parte de su ciclo de
-- vida es "casi append-only" en la práctica, delivery_status/sent_at/
-- error_message sí se actualizan a medida que avanza el envío, así que
-- lleva updated_at igual que el resto.
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON "incidents"
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON "announcements"
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON "announcement_recipients"
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON "reminders"
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON "documents"
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON "notifications"
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
