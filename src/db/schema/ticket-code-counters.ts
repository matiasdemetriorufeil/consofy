import { integer, pgTable } from "drizzle-orm/pg-core";

// Contador atómico para tickets.public_code (ver tickets.ts). GLOBAL por
// año, deliberadamente NO por organización ni por edificio: el formato
// "TC-2026-0143" no lleva ningún segmento de organización/edificio, así
// que un contador partido por edificio (la primera idea, la más obvia)
// dejaría que dos edificios distintos generen el mismo código el mismo
// año -- rompiendo la unicidad GLOBAL pedida para public_code. Por eso acá
// hay un solo número por año, compartido por todos los reclamos del
// sistema sin importar organización o edificio.
//
// Se actualiza exclusivamente desde el trigger set_ticket_public_code()
// (BEFORE INSERT en tickets, ver la migración 0007) con un UPSERT atómico
// -- ninguna Server Action escribe esta tabla directamente.
//
// Sin id uuid, sin organization_id, sin timestamps(): no es una entidad de
// negocio, es un detalle de implementación interno. "year" ya es su clave
// natural -- una PK uuid sería overhead puro, porque nada la referencia
// con una FK. No lleva organization_id ni FK compuesta por el mismo motivo
// que no aplica la regla de CLAUDE.md > Integridad entre organizaciones:
// esa regla es para tablas que referencian MÁS DE UNA entidad de negocio a
// la vez: esta tabla no referencia ninguna.
export const ticketCodeCounters = pgTable("ticket_code_counters", {
  year: integer("year").primaryKey(),
  lastValue: integer("last_value").notNull().default(0),
}).enableRLS();
