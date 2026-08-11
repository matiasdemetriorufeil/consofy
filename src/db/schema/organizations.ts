import { pgTable, text } from "drizzle-orm/pg-core";

import { idColumn, timestamps } from "./_shared";

export const organizations = pgTable("organizations", {
  id: idColumn(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("America/Argentina/Cordoba"),
  ...timestamps(),
}).enableRLS();
