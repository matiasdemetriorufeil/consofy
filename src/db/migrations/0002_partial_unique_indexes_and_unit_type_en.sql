ALTER TABLE "buildings" DROP CONSTRAINT "buildings_slug_format";--> statement-breakpoint
ALTER TABLE "units" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."unit_type";--> statement-breakpoint
CREATE TYPE "public"."unit_type" AS ENUM('apartment', 'parking', 'storage', 'commercial', 'other');--> statement-breakpoint
ALTER TABLE "units" ALTER COLUMN "type" SET DATA TYPE "public"."unit_type" USING "type"::"public"."unit_type";--> statement-breakpoint
DROP INDEX "buildings_organization_id_slug_unique";--> statement-breakpoint
DROP INDEX "units_building_tower_floor_number_unique";--> statement-breakpoint
CREATE INDEX "buildings_organization_id_idx" ON "buildings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "units_building_id_idx" ON "units" USING btree ("building_id");--> statement-breakpoint
CREATE UNIQUE INDEX "buildings_organization_id_slug_unique" ON "buildings" USING btree ("organization_id","slug") WHERE "buildings"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "units_building_tower_floor_number_unique" ON "units" USING btree ("building_id",coalesce("tower", ''),"floor","number") WHERE "units"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_slug_format" CHECK ("buildings"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');--> statement-breakpoint
-- Escrito a mano (drizzle-kit no genera funciones ni triggers): una sola
-- función reutilizada por las tres tablas que tienen updated_at.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON "organizations"
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON "buildings"
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON "units"
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();