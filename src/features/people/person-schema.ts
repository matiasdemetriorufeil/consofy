import { z } from "zod";

import { occupancyRole } from "@/db/schema/unit-occupancies";
import {
  AR_WHATSAPP_E164_REGEX,
  AR_WHATSAPP_HELP,
  normalizePhoneInput,
} from "@/lib/phone";

// Compartido entre cliente (PersonForm/OccupancyFields, vía zodResolver) y
// servidor (actions.ts) -- mismo patrón que building-schema.ts/unit-schema.ts.
// Ver CLAUDE.md > Reglas de seguridad: toda entrada se valida con Zod en el
// servidor aunque ya se haya validado en el cliente.

export const OCCUPANCY_ROLES = occupancyRole.enumValues;

// Teléfono: OPCIONAL a propósito, igual que la columna real
// (people.phone_e164, ver src/db/schema/people.ts) -- el administrador
// tiene que poder cargar a un vecino de quien todavía no tiene el
// teléfono. Cuando SÍ se carga, reutiliza el mismo formato (celular
// argentino, AR_WHATSAPP_E164_REGEX/AR_WHATSAPP_HELP de src/lib/phone.ts)
// que ya usa el WhatsApp del administrador en buildings/building-schema.ts
// -- es el mismo tipo de dato (un WhatsApp argentino), pedido
// explícitamente por el paso 4.4 para no tener dos validaciones distintas
// del mismo formato.
export const personFieldsSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, "Ingresá un nombre.")
    .max(120, "Como máximo 120 caracteres."),
  lastName: z
    .string()
    .trim()
    .max(120, "Como máximo 120 caracteres.")
    .nullish()
    .transform((value) => (value ? value : null)),
  phoneE164: z
    .string()
    .trim()
    .nullish()
    .transform((value) => (value ? normalizePhoneInput(value) : null))
    .refine((value) => value === null || AR_WHATSAPP_E164_REGEX.test(value), {
      message: AR_WHATSAPP_HELP,
    }),
  // toLowerCase(): mismo motivo que el email de buildings -- mejor UX que
  // rebotar el error del CHECK (people_email_lowercase) por una mayúscula
  // que la persona ni notó.
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(200, "Como máximo 200 caracteres.")
    .nullish()
    .transform((value) => (value ? value : null)),
  notes: z
    .string()
    .trim()
    .max(2000, "Como máximo 2000 caracteres.")
    .nullish()
    .transform((value) => (value ? value : null)),
});

export type PersonFieldsInput = z.input<typeof personFieldsSchema>;
export type PersonFieldsOutput = z.output<typeof personFieldsSchema>;

// yyyy-mm-dd -- formato nativo de <input type="date">, sin librería nueva.
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DATE_HELP = "Ingresá una fecha válida.";

export const occupancyFieldsSchema = z.object({
  unitId: z.uuid("Elegí una unidad."),
  role: z.enum(OCCUPANCY_ROLES, { message: "Elegí un rol." }),
  isPrimary: z.boolean(),
  startedOn: z.string().regex(DATE_REGEX, DATE_HELP),
});

export type OccupancyFieldsOutput = z.output<typeof occupancyFieldsSchema>;

// Alta combinada (paso 4.4): un vecino y su primera asignación a una unidad
// se cargan en un solo formulario/diálogo (ver PersonOccupancyDialog), pero
// pueden resolverse de dos formas distintas según si el teléfono tipeado ya
// existe en la organización (decisión 1 del reporte, "cómo evitar cargar a
// la misma persona dos veces"):
// - "new": no hay coincidencia -- se crea una persona nueva Y la ocupación.
// - "existing": el teléfono coincide con alguien ya cargado -- se reusa esa
//   persona (personId) y solo se crea la ocupación nueva.
// z.discriminatedUnion en vez de dos Server Actions separadas: las dos
// ramas comparten el mismo `buildingId`/ocupación, y el cliente decide cuál
// mandar según lo que devolvió el chequeo en vivo del teléfono
// (checkPersonByPhoneAction) -- una sola action de servidor que valida
// cualquiera de las dos formas, nunca confiando en que el cliente mandó la
// rama "correcta" (la persona igual se revalida contra la organización del
// lado del servidor).
export const createPersonWithOccupancyFormSchema = z.discriminatedUnion(
  "mode",
  [
    z
      .object({ mode: z.literal("new"), buildingId: z.uuid() })
      .extend(personFieldsSchema.shape)
      .extend(occupancyFieldsSchema.shape),
    z
      .object({
        mode: z.literal("existing"),
        buildingId: z.uuid(),
        personId: z.uuid(),
      })
      .extend(occupancyFieldsSchema.shape),
  ],
);
export type CreatePersonWithOccupancyInput = z.input<
  typeof createPersonWithOccupancyFormSchema
>;

export const updatePersonFormSchema = personFieldsSchema.extend({
  id: z.uuid(),
});
export type UpdatePersonFormInput = z.input<typeof updatePersonFormSchema>;

export type PersonFieldErrors = Partial<
  Record<keyof PersonFieldsOutput | keyof OccupancyFieldsOutput, string>
>;

export type PersonFormState = {
  ok: boolean;
  formError: string | null;
  fieldErrors: PersonFieldErrors;
};

export const initialPersonFormState: PersonFormState = {
  ok: false,
  formError: null,
  fieldErrors: {},
};

export const closeOccupancyFormSchema = z.object({
  occupancyId: z.uuid(),
  buildingId: z.uuid(),
  endedOn: z.string().regex(DATE_REGEX, DATE_HELP),
});
export type CloseOccupancyFormInput = z.input<typeof closeOccupancyFormSchema>;
