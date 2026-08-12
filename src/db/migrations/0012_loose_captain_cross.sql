CREATE POLICY "deny_anon_authenticated" ON "announcement_recipients" AS PERMISSIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "deny_anon_authenticated" ON "announcements" AS PERMISSIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "deny_anon_authenticated" ON "buildings" AS PERMISSIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "deny_anon_authenticated" ON "categories" AS PERMISSIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "deny_anon_authenticated" ON "documents" AS PERMISSIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "deny_anon_authenticated" ON "health_check" AS PERMISSIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "deny_anon_authenticated" ON "incidents" AS PERMISSIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "deny_anon_authenticated" ON "organizations" AS PERMISSIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "deny_anon_authenticated" ON "units" AS PERMISSIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "deny_anon_authenticated" ON "people" AS PERMISSIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "deny_anon_authenticated" ON "unit_occupancies" AS PERMISSIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "deny_anon_authenticated" ON "tickets" AS PERMISSIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "deny_anon_authenticated" ON "ticket_attachments" AS PERMISSIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "deny_anon_authenticated" ON "ticket_events" AS PERMISSIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "deny_anon_authenticated" ON "ticket_code_counters" AS PERMISSIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "deny_anon_authenticated" ON "reminders" AS PERMISSIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "deny_anon_authenticated" ON "notifications" AS PERMISSIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);