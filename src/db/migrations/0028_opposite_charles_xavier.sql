ALTER TYPE "public"."ticket_event_type" ADD VALUE 'incident_merged';--> statement-breakpoint
CREATE INDEX "tickets_incident_id_idx" ON "tickets" USING btree ("incident_id");