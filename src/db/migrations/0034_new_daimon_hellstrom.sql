ALTER TABLE "app_users" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_email_lowercase" CHECK ("app_users"."email" = lower("app_users"."email"));