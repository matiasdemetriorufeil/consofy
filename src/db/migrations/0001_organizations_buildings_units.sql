CREATE TYPE "public"."unit_type" AS ENUM('departamento', 'cochera', 'baulera', 'local', 'otro');--> statement-breakpoint
CREATE TABLE "buildings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"city" text NOT NULL,
	"slug" text NOT NULL,
	"public_token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"admin_whatsapp_e164" text NOT NULL,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "buildings_public_token_unique" UNIQUE("public_token"),
	CONSTRAINT "buildings_slug_format" CHECK ("buildings"."slug" ~ '^[a-z0-9-]+$'),
	CONSTRAINT "buildings_admin_whatsapp_e164_format" CHECK ("buildings"."admin_whatsapp_e164" ~ '^\+[1-9][0-9]{1,14}$')
);
--> statement-breakpoint
ALTER TABLE "buildings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'America/Argentina/Cordoba' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"building_id" uuid NOT NULL,
	"tower" text,
	"floor" text NOT NULL,
	"number" text NOT NULL,
	"type" "unit_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "units" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "health_check" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "buildings_organization_id_slug_unique" ON "buildings" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "units_building_tower_floor_number_unique" ON "units" USING btree ("building_id",coalesce("tower", ''),"floor","number");