ALTER TABLE "buildings" ADD COLUMN "similarity_window_hours" integer DEFAULT 72 NOT NULL;--> statement-breakpoint
ALTER TABLE "buildings" ADD COLUMN "similarity_threshold" real DEFAULT 0.2 NOT NULL;--> statement-breakpoint
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_similarity_window_hours_range" CHECK ("buildings"."similarity_window_hours" >= 1 and "buildings"."similarity_window_hours" <= 720);--> statement-breakpoint
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_similarity_threshold_range" CHECK ("buildings"."similarity_threshold" > 0 and "buildings"."similarity_threshold" <= 1);