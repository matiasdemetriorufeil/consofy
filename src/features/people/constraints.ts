// Nombres de constraints de people/unit_occupancies que se traducen a
// mensajes en criollo en más de un lugar (people/actions.ts, features/
// imports/actions.ts) -- constantes compartidas para que un nombre de
// constraint nunca quede escrito dos veces y pueda desalinearse si algún
// día cambia en una migración.
export const PHONE_UNIQUE_CONSTRAINT =
  "people_organization_id_phone_e164_unique";
export const PHONE_FORMAT_CHECK = "people_phone_e164_format";
export const PRIMARY_UNIQUE_CONSTRAINT =
  "unit_occupancies_primary_per_unit_unique";
// Renombrado en el cierre de 4.4 junto con el índice mismo (antes incluía
// `role`, ver unit-occupancies.ts): ahora es por unidad+persona sola, sin
// importar el rol.
export const PERSON_UNIT_ONGOING_UNIQUE_CONSTRAINT =
  "unit_occupancies_unit_person_ongoing_unique";
export const OCCUPANCY_ENDED_ON_CHECK =
  "unit_occupancies_ended_on_after_started_on";
