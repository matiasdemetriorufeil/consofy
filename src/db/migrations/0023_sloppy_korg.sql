CREATE TYPE "public"."ticket_similarity_status" AS ENUM('pending', 'grouped', 'discarded');--> statement-breakpoint
CREATE TABLE "ticket_similarity_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	"candidate_ticket_id" uuid NOT NULL,
	"similarity" real NOT NULL,
	"status" "ticket_similarity_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "ticket_similarity_candidates_ticket_candidate_unique" UNIQUE("ticket_id","candidate_ticket_id"),
	CONSTRAINT "ticket_similarity_candidates_not_self" CHECK ("ticket_similarity_candidates"."ticket_id" != "ticket_similarity_candidates"."candidate_ticket_id"),
	CONSTRAINT "ticket_similarity_candidates_similarity_range" CHECK ("ticket_similarity_candidates"."similarity" >= 0 and "ticket_similarity_candidates"."similarity" <= 1)
);
--> statement-breakpoint
ALTER TABLE "ticket_similarity_candidates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ticket_similarity_candidates" ADD CONSTRAINT "ticket_similarity_candidates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_similarity_candidates" ADD CONSTRAINT "ticket_similarity_candidates_ticket_id_organization_id_tickets_id_organization_id_fk" FOREIGN KEY ("ticket_id","organization_id") REFERENCES "public"."tickets"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_similarity_candidates" ADD CONSTRAINT "ticket_similarity_candidates_candidate_ticket_id_organization_id_tickets_id_organization_id_fk" FOREIGN KEY ("candidate_ticket_id","organization_id") REFERENCES "public"."tickets"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticket_similarity_candidates_organization_id_pending_idx" ON "ticket_similarity_candidates" USING btree ("organization_id") WHERE "ticket_similarity_candidates"."status" = 'pending';--> statement-breakpoint
CREATE POLICY "deny_anon_authenticated" ON "ticket_similarity_candidates" AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);