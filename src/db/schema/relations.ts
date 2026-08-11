import { relations } from "drizzle-orm";

import { buildings } from "./buildings";
import { organizations } from "./organizations";
import { units } from "./units";

export const organizationsRelations = relations(organizations, ({ many }) => ({
  buildings: many(buildings),
}));

export const buildingsRelations = relations(buildings, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [buildings.organizationId],
    references: [organizations.id],
  }),
  units: many(units),
}));

export const unitsRelations = relations(units, ({ one }) => ({
  building: one(buildings, {
    fields: [units.buildingId],
    references: [buildings.id],
  }),
}));
