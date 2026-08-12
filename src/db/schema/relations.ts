import { relations } from "drizzle-orm";

import { buildings } from "./buildings";
import { categories } from "./categories";
import { organizations } from "./organizations";
import { people } from "./people";
import { ticketAttachments } from "./ticket-attachments";
import { ticketEvents } from "./ticket-events";
import { tickets } from "./tickets";
import { unitOccupancies } from "./unit-occupancies";
import { units } from "./units";

export const organizationsRelations = relations(organizations, ({ many }) => ({
  buildings: many(buildings),
  people: many(people),
  categories: many(categories),
  tickets: many(tickets),
}));

export const buildingsRelations = relations(buildings, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [buildings.organizationId],
    references: [organizations.id],
  }),
  units: many(units),
  tickets: many(tickets),
}));

export const unitsRelations = relations(units, ({ one, many }) => ({
  building: one(buildings, {
    fields: [units.buildingId],
    references: [buildings.id],
  }),
  occupancies: many(unitOccupancies),
  tickets: many(tickets),
}));

export const peopleRelations = relations(people, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [people.organizationId],
    references: [organizations.id],
  }),
  occupancies: many(unitOccupancies),
  tickets: many(tickets),
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

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [categories.organizationId],
    references: [organizations.id],
  }),
  tickets: many(tickets),
}));

export const ticketsRelations = relations(tickets, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [tickets.organizationId],
    references: [organizations.id],
  }),
  building: one(buildings, {
    fields: [tickets.buildingId],
    references: [buildings.id],
  }),
  unit: one(units, {
    fields: [tickets.unitId],
    references: [units.id],
  }),
  person: one(people, {
    fields: [tickets.personId],
    references: [people.id],
  }),
  category: one(categories, {
    fields: [tickets.categoryId],
    references: [categories.id],
  }),
  attachments: many(ticketAttachments),
  events: many(ticketEvents),
}));

export const ticketAttachmentsRelations = relations(
  ticketAttachments,
  ({ one }) => ({
    ticket: one(tickets, {
      fields: [ticketAttachments.ticketId],
      references: [tickets.id],
    }),
  }),
);

export const ticketEventsRelations = relations(ticketEvents, ({ one }) => ({
  ticket: one(tickets, {
    fields: [ticketEvents.ticketId],
    references: [tickets.id],
  }),
}));
