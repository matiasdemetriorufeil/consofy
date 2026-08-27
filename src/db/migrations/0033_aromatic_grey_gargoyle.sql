ALTER TYPE "public"."notification_type" ADD VALUE 'urgent_ticket' BEFORE 'reminder_due';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'incident_multi_unit' BEFORE 'system';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'ticket_overdue' BEFORE 'system';