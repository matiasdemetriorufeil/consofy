CREATE TYPE "public"."occupancy_role" AS ENUM('owner', 'tenant');--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text,
	"phone_e164" text,
	"email" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "people_phone_e164_format" CHECK ("people"."phone_e164" ~ '^\+[1-9][0-9]{1,14}$'),
	CONSTRAINT "people_email_lowercase" CHECK ("people"."email" = lower("people"."email"))
);
--> statement-breakpoint
ALTER TABLE "people" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "unit_occupancies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"role" "occupancy_role" NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"started_on" date NOT NULL,
	"ended_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "unit_occupancies_ended_on_after_started_on" CHECK ("unit_occupancies"."ended_on" is null or "unit_occupancies"."ended_on" > "unit_occupancies"."started_on")
);
--> statement-breakpoint
ALTER TABLE "unit_occupancies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_occupancies" ADD CONSTRAINT "unit_occupancies_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_occupancies" ADD CONSTRAINT "unit_occupancies_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "people_organization_id_phone_e164_unique" ON "people" USING btree ("organization_id","phone_e164") WHERE "people"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "people_organization_id_idx" ON "people" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unit_occupancies_primary_per_unit_unique" ON "unit_occupancies" USING btree ("unit_id") WHERE "unit_occupancies"."is_primary" and "unit_occupancies"."ended_on" is null and "unit_occupancies"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "unit_occupancies_unit_person_role_ongoing_unique" ON "unit_occupancies" USING btree ("unit_id","person_id","role") WHERE "unit_occupancies"."ended_on" is null and "unit_occupancies"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "unit_occupancies_unit_id_idx" ON "unit_occupancies" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "unit_occupancies_person_id_idx" ON "unit_occupancies" USING btree ("person_id");--> statement-breakpoint
-- Escrito a mano: mismo trigger reutilizable de la migración 0002 (ya con
-- el search_path fijo de la 0003), aplicado a las dos tablas nuevas.
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON "people"
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON "unit_occupancies"
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();