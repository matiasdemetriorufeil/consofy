DROP POLICY "deny_anon_authenticated" ON "announcement_recipients" CASCADE;--> statement-breakpoint
DROP POLICY "deny_anon_authenticated" ON "announcements" CASCADE;--> statement-breakpoint
DROP POLICY "deny_anon_authenticated" ON "buildings" CASCADE;--> statement-breakpoint
DROP POLICY "deny_anon_authenticated" ON "categories" CASCADE;--> statement-breakpoint
DROP POLICY "deny_anon_authenticated" ON "documents" CASCADE;--> statement-breakpoint
DROP POLICY "deny_anon_authenticated" ON "health_check" CASCADE;--> statement-breakpoint
DROP POLICY "deny_anon_authenticated" ON "incidents" CASCADE;--> statement-breakpoint
DROP POLICY "deny_anon_authenticated" ON "organizations" CASCADE;--> statement-breakpoint
DROP POLICY "deny_anon_authenticated" ON "units" CASCADE;--> statement-breakpoint
DROP POLICY "deny_anon_authenticated" ON "people" CASCADE;--> statement-breakpoint
DROP POLICY "deny_anon_authenticated" ON "unit_occupancies" CASCADE;--> statement-breakpoint
DROP POLICY "deny_anon_authenticated" ON "tickets" CASCADE;--> statement-breakpoint
DROP POLICY "deny_anon_authenticated" ON "ticket_attachments" CASCADE;--> statement-breakpoint
DROP POLICY "deny_anon_authenticated" ON "ticket_events" CASCADE;--> statement-breakpoint
DROP POLICY "deny_anon_authenticated" ON "ticket_code_counters" CASCADE;--> statement-breakpoint
DROP POLICY "deny_anon_authenticated" ON "reminders" CASCADE;--> statement-breakpoint
DROP POLICY "deny_anon_authenticated" ON "notifications" CASCADE;--> statement-breakpoint
CREATE POLICY "deny_anon_authenticated" ON "announcement_recipients" AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "deny_anon_authenticated" ON "announcements" AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "deny_anon_authenticated" ON "buildings" AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "deny_anon_authenticated" ON "categories" AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "deny_anon_authenticated" ON "documents" AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "deny_anon_authenticated" ON "health_check" AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "deny_anon_authenticated" ON "incidents" AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "deny_anon_authenticated" ON "organizations" AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "deny_anon_authenticated" ON "units" AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "deny_anon_authenticated" ON "people" AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "deny_anon_authenticated" ON "unit_occupancies" AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "deny_anon_authenticated" ON "tickets" AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "deny_anon_authenticated" ON "ticket_attachments" AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "deny_anon_authenticated" ON "ticket_events" AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "deny_anon_authenticated" ON "ticket_code_counters" AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "deny_anon_authenticated" ON "reminders" AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "deny_anon_authenticated" ON "notifications" AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);