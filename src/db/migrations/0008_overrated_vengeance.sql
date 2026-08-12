ALTER TABLE "tickets" DROP CONSTRAINT "tickets_public_code_unique";--> statement-breakpoint
-- drizzle-kit no pudo resolver solo el nombre de la PK vieja (era sobre
-- "year" únicamente, de la migración 0007). Lo busqué a mano contra la base
-- real (information_schema.table_constraints) y completé el DROP que
-- drizzle-kit dejó comentado -- sin este DROP, el ALTER de más abajo
-- hubiera fallado: la tabla ya tenía una PRIMARY KEY y no puede tener dos.
ALTER TABLE "ticket_code_counters" DROP CONSTRAINT "ticket_code_counters_pkey";--> statement-breakpoint
-- Reordenado a mano: drizzle-kit generó la PRIMARY KEY compuesta ANTES que
-- el ADD COLUMN "building_id" que esa misma PK necesita -- hubiera fallado
-- con "column building_id does not exist". El ADD COLUMN va primero acá.
ALTER TABLE "buildings" ADD COLUMN "code_prefix" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_code_counters" ADD COLUMN "building_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_code_counters" ADD CONSTRAINT "ticket_code_counters_building_id_year_pk" PRIMARY KEY("building_id","year");--> statement-breakpoint
ALTER TABLE "ticket_code_counters" ADD CONSTRAINT "ticket_code_counters_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "buildings_organization_id_code_prefix_unique" ON "buildings" USING btree ("organization_id","code_prefix") WHERE "buildings"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_organization_id_public_code_unique" UNIQUE("organization_id","public_code");--> statement-breakpoint
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_code_prefix_format" CHECK ("buildings"."code_prefix" ~ '^[A-Z]{2,4}$');
