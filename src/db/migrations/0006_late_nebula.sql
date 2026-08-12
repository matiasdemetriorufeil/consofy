CREATE TYPE "public"."ticket_priority" AS ENUM('low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."ticket_source" AS ENUM('public_form', 'admin', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('new', 'in_progress', 'resolved', 'closed', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."ticket_event_actor_type" AS ENUM('neighbor', 'admin', 'system');--> statement-breakpoint
CREATE TYPE "public"."ticket_event_type" AS ENUM('created', 'status_changed', 'priority_changed', 'assigned', 'note_added', 'attachment_added', 'merged_into_incident', 'whatsapp_handoff_opened');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"icon" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"default_priority" "ticket_priority" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "categories_id_organization_id_unique" UNIQUE("id","organization_id")
);
--> statement-breakpoint
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"building_id" uuid NOT NULL,
	"unit_id" uuid,
	"person_id" uuid,
	"category_id" uuid NOT NULL,
	"unit_label_raw" text,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"priority" "ticket_priority" NOT NULL,
	"status" "ticket_status" DEFAULT 'new' NOT NULL,
	"source" "ticket_source" NOT NULL,
	"assignee" text,
	"public_code" text DEFAULT '' NOT NULL,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"incident_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "tickets_id_organization_id_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "tickets_public_code_unique" UNIQUE("public_code"),
	CONSTRAINT "tickets_unit_id_or_label_present" CHECK ("tickets"."unit_id" is not null or "tickets"."unit_label_raw" is not null),
	CONSTRAINT "tickets_resolved_at_requires_resolved_or_closed" CHECK ("tickets"."resolved_at" is null or "tickets"."status" in ('resolved', 'closed')),
	CONSTRAINT "tickets_closed_at_requires_closed" CHECK ("tickets"."closed_at" is null or "tickets"."status" = 'closed'),
	CONSTRAINT "tickets_timestamps_chronological" CHECK (("tickets"."resolved_at" is null or "tickets"."resolved_at" >= "tickets"."reported_at") and ("tickets"."closed_at" is null or "tickets"."resolved_at" is null or "tickets"."closed_at" >= "tickets"."resolved_at"))
);
--> statement-breakpoint
ALTER TABLE "tickets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ticket_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"original_filename" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "ticket_attachments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ticket_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	"type" "ticket_event_type" NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor_type" "ticket_event_actor_type" NOT NULL,
	"actor_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ticket_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ticket_code_counters" (
	"year" integer PRIMARY KEY NOT NULL,
	"last_value" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ticket_code_counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_building_id_organization_id_buildings_id_organization_id_fk" FOREIGN KEY ("building_id","organization_id") REFERENCES "public"."buildings"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_unit_id_organization_id_units_id_organization_id_fk" FOREIGN KEY ("unit_id","organization_id") REFERENCES "public"."units"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_person_id_organization_id_people_id_organization_id_fk" FOREIGN KEY ("person_id","organization_id") REFERENCES "public"."people"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_category_id_organization_id_categories_id_organization_id_fk" FOREIGN KEY ("category_id","organization_id") REFERENCES "public"."categories"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_ticket_id_organization_id_tickets_id_organization_id_fk" FOREIGN KEY ("ticket_id","organization_id") REFERENCES "public"."tickets"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_ticket_id_organization_id_tickets_id_organization_id_fk" FOREIGN KEY ("ticket_id","organization_id") REFERENCES "public"."tickets"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_organization_id_name_unique" ON "categories" USING btree ("organization_id","name") WHERE "categories"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "tickets_building_id_status_reported_at_idx" ON "tickets" USING btree ("building_id","status","reported_at");--> statement-breakpoint
CREATE INDEX "tickets_building_id_category_id_reported_at_idx" ON "tickets" USING btree ("building_id","category_id","reported_at");--> statement-breakpoint
CREATE INDEX "ticket_attachments_ticket_id_idx" ON "ticket_attachments" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "ticket_events_ticket_id_created_at_idx" ON "ticket_events" USING btree ("ticket_id","created_at");