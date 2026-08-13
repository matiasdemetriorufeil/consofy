import { z } from "zod";

// Compartido entre cliente (BuildingForm, vía zodResolver) y servidor
// (actions.ts) -- mismo patrón que login-schema.ts. Ver CLAUDE.md > Reglas
// de seguridad: toda entrada se valida con Zod en el servidor aunque ya se
// haya validado en el cliente.

// Mismo patrón que el CHECK de la base (buildings_slug_format): minúsculas,
// números y guiones simples, sin empezar/terminar con guión ni tener dos
// seguidos.
const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SLUG_HELP =
  "Usá minúsculas, números y guiones, sin empezar ni terminar con guión.";

// Mismo patrón que el CHECK de la base (buildings_code_prefix_format): 2 a
// 4 letras mayúsculas, nada más.
export const CODE_PREFIX_REGEX = /^[A-Z]{2,4}$/;
export const CODE_PREFIX_HELP =
  "Usá de 2 a 4 letras mayúsculas, por ejemplo TC.";

// Argentina, no E.164 genérico: la base acepta cualquier E.164 válido
// (buildings_admin_whatsapp_e164_format, más permisivo), pero el WhatsApp
// del administrador de un edificio argentino siempre es un celular
// argentino -- +54 9, código de área, número, sin espacios. Validarlo acá
// más estricto que la base es a propósito: un E.164 de otro país pasaría el
// CHECK de la base pero el link wa.me que se arma con este número (ver
// CLAUDE.md > Reglas de WhatsApp) dejaría de tener sentido para el flujo
// real de la app.
const AR_WHATSAPP_E164_REGEX = /^\+549\d{10}$/;
export const AR_WHATSAPP_HELP =
  "Escribilo con código de país y de área, sin el 0 ni el 15, por ejemplo +5493515551234 para un celular de Córdoba (351) 555-1234.";

// Espacios, guiones, puntos y paréntesis son ruido habitual al tipear un
// teléfono a mano ("351 555-1234", "(351) 555.1234") -- se descartan antes
// de validar el formato, para no rebotar por puntuación en vez de por el
// número en sí.
function normalizePhoneInput(value: string): string {
  return value.replace(/[\s().-]/g, "");
}

export const buildingFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Ingresá un nombre.")
    .max(120, "Como máximo 120 caracteres."),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Ingresá un identificador.")
    .max(80, "Como máximo 80 caracteres.")
    .regex(SLUG_REGEX, SLUG_HELP),
  codePrefix: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, "Ingresá un prefijo.")
    .regex(CODE_PREFIX_REGEX, CODE_PREFIX_HELP),
  address: z.string().trim().min(1, "Ingresá una dirección."),
  city: z.string().trim().min(1, "Ingresá una ciudad."),
  adminWhatsappE164: z
    .string()
    .trim()
    .min(1, "Ingresá el WhatsApp del administrador.")
    .transform(normalizePhoneInput)
    .refine((value) => AR_WHATSAPP_E164_REGEX.test(value), {
      message: AR_WHATSAPP_HELP,
    }),
  // nullish() (no solo optional()): el formulario manda "" o undefined
  // (campo de texto vacío), pero el propio cliente ya valida con este mismo
  // esquema antes de enviar (zodResolver) -- lo que en definitiva viaja al
  // servidor es la SALIDA ya transformada (string | null), no la entrada
  // cruda. Si el esquema solo aceptara string | undefined como entrada,
  // reenviar un `null` ya transformado rebotaría en el servidor con "se
  // esperaba string, se recibió null" -- un bug de tipos, no de datos
  // realmente inválidos. nullish() acepta los dos.
  notes: z
    .string()
    .trim()
    .max(2000, "Como máximo 2000 caracteres.")
    .nullish()
    .transform((value) => (value ? value : null)),
});

export type BuildingFormInput = z.input<typeof buildingFormSchema>;
export type BuildingFormOutput = z.output<typeof buildingFormSchema>;

export const updateBuildingFormSchema = buildingFormSchema.extend({
  id: z.uuid(),
});

export type UpdateBuildingFormInput = z.input<typeof updateBuildingFormSchema>;

// Vive acá y no en actions.ts: un archivo "use server" solo puede exportar
// funciones async -- mismo motivo que separa LoginState de actions.ts en el
// feature de auth.
export type BuildingFieldErrors = Partial<
  Record<keyof BuildingFormOutput, string>
>;

export type BuildingFormState = {
  ok: boolean;
  formError: string | null;
  fieldErrors: BuildingFieldErrors;
};

export const initialBuildingFormState: BuildingFormState = {
  ok: false,
  formError: null,
  fieldErrors: {},
};

// Quita tildes/diacríticos para que "Córdoba" -> "cordoba", no "c-rdoba" --
// normalize("NFD") separa la letra de su acento (combining diacritical
// mark, U+0300-U+036F) para poder descartarlo con un replace simple.
function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Sugerencia de slug a partir del nombre (paso 4.1, punto 2): editable
// después, esto solo precarga el campo la primera vez y cada vez que el
// nombre cambia mientras el usuario no tocó el slug a mano (ver
// BuildingForm). Espacios y cualquier caracter que no sea letra/número se
// convierten en un solo guión; nunca guiones al principio/final --
// exactamente lo que exige SLUG_REGEX, para que la sugerencia sea siempre
// válida sin que el usuario tenga que corregirla.
export function slugify(name: string): string {
  return stripDiacritics(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Sugerencia de prefijo a partir del nombre (paso 4.1, punto 2): "Torre
// Central" -> "TC" (inicial de cada palabra, hasta 4). Con una sola
// palabra ("Bellavista") no hay de dónde sacar iniciales múltiples, así que
// usa las primeras letras de esa palabra en su lugar ("BELL") -- siempre
// entre 2 y 4 letras, lo que exige CODE_PREFIX_REGEX, para que la
// sugerencia nunca necesite corrección solo por longitud.
export function suggestCodePrefix(name: string): string {
  const words = stripDiacritics(name)
    .toUpperCase()
    .match(/[A-Z]+/g);

  if (!words || words.length === 0) {
    return "";
  }

  const prefix =
    words.length === 1
      ? words[0].slice(0, 4)
      : words
          .slice(0, 4)
          .map((word) => word[0])
          .join("");

  return prefix.length >= 2 ? prefix : words[0].slice(0, 2);
}
