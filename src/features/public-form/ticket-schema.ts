import { z } from "zod";

import {
  AR_WHATSAPP_E164_REGEX,
  AR_WHATSAPP_HELP,
  normalizePhoneInput,
} from "@/lib/phone";
import { personFieldsSchema } from "@/features/people/person-schema";

// Compartido entre cliente (TicketForm, vía zodResolver) y lo que va a ser
// el servidor en el paso 5.5 -- mismo patrón que unit-schema.ts/
// person-schema.ts (ver CLAUDE.md > Reglas de seguridad). Cubre los datos
// REALES de un reclamo (identificación + problema); las fotos del paso 3
// tienen su propia validación más abajo, separada a propósito -- ver el
// comentario de esa sección.

export const PUBLIC_TICKET_STEPS = [
  { id: 1, title: "Tus datos" },
  { id: 2, title: "El problema" },
  { id: 3, title: "Fotos" },
  { id: 4, title: "Revisá y enviá" },
] as const;
export const TOTAL_STEPS = PUBLIC_TICKET_STEPS.length;

// A diferencia de people.phoneE164 (nullable -- el administrador puede
// cargar a alguien de quien todavía no tiene el teléfono), acá es
// OBLIGATORIO: el formulario público es justo el flujo donde, según
// CLAUDE.md > Acceso a datos, el teléfono "SIEMPRE" se pide. Reusa el mismo
// formato/regex/normalización que ya usa people (AR_WHATSAPP_*, src/lib/
// phone.ts), no una validación nueva.
const requiredPhoneSchema = z
  .string()
  .trim()
  .min(1, "Dejanos un teléfono de contacto.")
  .transform(normalizePhoneInput)
  .pipe(z.string().regex(AR_WHATSAPP_E164_REGEX, AR_WHATSAPP_HELP));

// firstName/lastName: mismas reglas que people (personFieldsSchema), sin
// reescribirlas -- reuso directo con pick(), mismo criterio que "extraer
// recién con el segundo consumidor real" ya aplicado a AR_WHATSAPP_*.
const identificationFields = personFieldsSchema
  .pick({ firstName: true, lastName: true })
  .extend({
    phoneE164: requiredPhoneSchema,
    // Unidad: dos formas mutuamente excluyentes de identificarla, reflejo
    // exacto del CHECK de tickets ("unit_id o unit_label_raw", ver
    // src/db/schema/tickets.ts) -- unitNotListed es el toggle que el
    // vecino usa cuando no encuentra su unidad en la lista (paso 5.3 es el
    // selector "de verdad"; acá alcanza con una lista simple + esta
    // salida).
    unitNotListed: z.boolean(),
    unitId: z
      .uuid()
      .nullish()
      .transform((value) => value ?? null),
    unitLabelRaw: z
      .string()
      .trim()
      .max(60, "Como máximo 60 caracteres.")
      .nullish()
      .transform((value) => (value ? value : null)),
  });

// Categoría y descripción. SIN prioridad -- decisión de producto explicada
// en el reporte del paso 5.2: dejarla en manos del vecino no aporta señal
// real (todo el mundo marca "urgente"), así que la prioridad real del
// reclamo sale de categories.default_priority al crearlo (paso 5.5), no de
// un campo acá.
const problemFields = z.object({
  categoryId: z.uuid({ message: "Elegí una categoría." }),
  description: z
    .string()
    .trim()
    .min(10, "Contanos un poco más -- al menos 10 caracteres.")
    .max(2000, "Como máximo 2000 caracteres."),
});

export const publicTicketFormSchema = identificationFields
  .extend(problemFields.shape)
  .refine((data) => data.unitNotListed || !!data.unitId, {
    message: "Elegí tu unidad de la lista.",
    path: ["unitId"],
  })
  .refine((data) => !data.unitNotListed || !!data.unitLabelRaw, {
    message: "Contanos dónde vivís (piso y depto, o una referencia).",
    path: ["unitLabelRaw"],
  });

export type PublicTicketFormInput = z.input<typeof publicTicketFormSchema>;
export type PublicTicketFormOutput = z.output<typeof publicTicketFormSchema>;

// Qué campos valida cada paso al apretar "Continuar" -- ver TicketForm.
// trigger(names) de react-hook-form igual corre el resolver completo por
// dentro (un solo schema, no uno por paso), pero solo marca/expone errores
// de los campos pedidos, así que un error del paso 2 nunca aparece
// mientras el vecino todavía está en el paso 1.
export const IDENTIFICATION_STEP_FIELDS = [
  "firstName",
  "lastName",
  "phoneE164",
  "unitNotListed",
  "unitId",
  "unitLabelRaw",
] as const satisfies readonly (keyof PublicTicketFormInput)[];

export const PROBLEM_STEP_FIELDS = [
  "categoryId",
  "description",
] as const satisfies readonly (keyof PublicTicketFormInput)[];

// -----------------------------------------------------------------------
// Fotos (paso 5.2, punto "estructura mínima")
// -----------------------------------------------------------------------
// Sin subida real todavía (eso es el paso 5.4): acá solo se capturan
// File[] en memoria del lado del cliente y se valida tipo/tamaño antes de
// aceptarlas, para que el paso 5.4 herede estas mismas constantes en vez
// de inventarlas de nuevo. No forman parte de publicTicketFormSchema
// porque un File no es serializable de la misma forma que el resto del
// formulario (no hay nada del lado del servidor todavía que las reciba).
export const MAX_TICKET_PHOTOS = 5;
export const MAX_PHOTO_SIZE_BYTES = 8 * 1024 * 1024;

export function validatePhotoFile(file: File): string | null {
  if (!file.type.startsWith("image/")) {
    return "Ese archivo no es una foto.";
  }
  if (file.size > MAX_PHOTO_SIZE_BYTES) {
    return "Esa foto pesa demasiado (máximo 8 MB).";
  }
  return null;
}
