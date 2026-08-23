ALTER TABLE "announcements" ADD COLUMN "template_id" text;--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN "template_variables" jsonb DEFAULT '{}'::jsonb NOT NULL;