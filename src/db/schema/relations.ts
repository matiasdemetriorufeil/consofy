import { relations } from "drizzle-orm";

import { buildings } from "./buildings";
import { organizations } from "./organizations";
import { people } from "./people";
import { unitOccupancies } from "./unit-occupancies";
import { units } from "./units";

export const organizationsRelations = relations(organizations, ({ many }) => ({
  buildings: many(buildings),
  people: many(people),
}));

export const buildingsRelations = relations(buildings, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [buildings.organizationId],
    references: [organizations.id],
  }),
  units: many(units),
}));

export const unitsRelations = relations(units, ({ one, many }) => ({
  building: one(buildings, {
    fields: [units.buildingId],
    references: [buildings.id],
  }),
  occupancies: many(unitOccupancies),
}));

export const peopleRelations = relations(people, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [people.organizationId],
    references: [organizations.id],
  }),
  occupancies: many(unitOccupancies),
}));

// units <-> people es muchos-a-muchos a través de unit_occupancies. Drizzle
// no tiene un helper directo para M:N: se modela con un one() a cada lado
// en la tabla puente, y se navega unit -> occupancies -> person (o al
// revés) con la query relacional.
export const unitOccupanciesRelations = relations(
  unitOccupancies,
  ({ one }) => ({
    unit: one(units, {
      fields: [unitOccupancies.unitId],
      references: [units.id],
    }),
    person: one(people, {
      fields: [unitOccupancies.personId],
      references: [people.id],
    }),
  }),
);
