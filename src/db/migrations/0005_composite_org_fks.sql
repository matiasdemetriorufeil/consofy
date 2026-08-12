ALTER TABLE "units" DROP CONSTRAINT "units_building_id_buildings_id_fk";
--> statement-breakpoint
ALTER TABLE "unit_occupancies" DROP CONSTRAINT "unit_occupancies_unit_id_units_id_fk";
--> statement-breakpoint
ALTER TABLE "unit_occupancies" DROP CONSTRAINT "unit_occupancies_person_id_people_id_fk";
--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN "organization_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "unit_occupancies" ADD COLUMN "organization_id" uuid NOT NULL;--> statement-breakpoint
-- Reordenado a mano: drizzle-kit generó las FK compuestas ANTES que las
-- UNIQUE(id, organization_id) que necesitan para ser válidas. Una FK solo
-- se puede crear si ya existe una unique/PK constraint exacta sobre las
-- columnas referenciadas (ver CLAUDE.md > Integridad entre
-- organizaciones); en el orden original, "ALTER TABLE units ADD
-- CONSTRAINT ... REFERENCES buildings(id, organization_id)" hubiera
-- fallado porque esa constraint en buildings todavía no existía en ese
-- punto de la migración. Por eso las tres UNIQUE van primero acá.
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_id_organization_id_unique" UNIQUE("id","organization_id");--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_id_organization_id_unique" UNIQUE("id","organization_id");--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_id_organization_id_unique" UNIQUE("id","organization_id");--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_building_id_organization_id_buildings_id_organization_id_fk" FOREIGN KEY ("building_id","organization_id") REFERENCES "public"."buildings"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_occupancies" ADD CONSTRAINT "unit_occupancies_unit_id_organization_id_units_id_organization_id_fk" FOREIGN KEY ("unit_id","organization_id") REFERENCES "public"."units"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_occupancies" ADD CONSTRAINT "unit_occupancies_person_id_organization_id_people_id_organization_id_fk" FOREIGN KEY ("person_id","organization_id") REFERENCES "public"."people"("id","organization_id") ON DELETE restrict ON UPDATE no action;
