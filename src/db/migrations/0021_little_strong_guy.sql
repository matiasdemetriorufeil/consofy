CREATE TYPE "public"."public_form_rate_limit_kind" AS ENUM('ticket_submission', 'attachment_upload');--> statement-breakpoint
CREATE TABLE "public_form_rate_limit_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "public_form_rate_limit_kind" NOT NULL,
	"ip" text NOT NULL,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "public_form_rate_limit_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "public_form_rate_limit_attempts_kind_ip_created_at_idx" ON "public_form_rate_limit_attempts" USING btree ("kind","ip","created_at");--> statement-breakpoint
CREATE INDEX "public_form_rate_limit_attempts_kind_phone_created_at_idx" ON "public_form_rate_limit_attempts" USING btree ("kind","phone","created_at");--> statement-breakpoint
CREATE POLICY "deny_anon_authenticated" ON "public_form_rate_limit_attempts" AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);