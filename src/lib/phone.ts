// Validación del WhatsApp argentino, compartida entre el teléfono del
// administrador de un edificio (buildings, paso 4.1) y el teléfono de un
// vecino (people, paso 4.4) -- extraída acá en cuanto apareció el segundo
// consumidor, mismo criterio que BuildingEditableFields en el paso 4.2
// (extraer recién cuando hay una segunda necesidad real, no antes). Antes
// vivía solo en building-schema.ts; people/person-schema.ts la reutiliza tal
// cual en vez de escribir una segunda validación distinta para el mismo
// formato.
//
// Argentina, no E.164 genérico: la base acepta cualquier E.164 válido (ver
// los CHECK de buildings.ts y people.ts, más permisivos), pero el WhatsApp
// de un administrador o un vecino en esta app siempre es un celular
// argentino -- +54 9, código de área, número, sin espacios. Validarlo acá
// más estricto que la base es a propósito: un E.164 de otro país pasaría el
// CHECK de la base pero el link wa.me que se arma con este número (ver
// CLAUDE.md > Reglas de WhatsApp) dejaría de tener sentido para el flujo
// real de la app.
export const AR_WHATSAPP_E164_REGEX = /^\+549\d{10}$/;
export const AR_WHATSAPP_HELP =
  "Escribilo con código de país y de área, sin el 0 ni el 15, por ejemplo +5493515551234 para un celular de Córdoba (351) 555-1234.";

// Espacios, guiones, puntos y paréntesis son ruido habitual al tipear un
// teléfono a mano ("351 555-1234", "(351) 555.1234") -- se descartan antes
// de validar el formato, para no rebotar por puntuación en vez de por el
// número en sí.
export function normalizePhoneInput(value: string): string {
  return value.replace(/[\s().-]/g, "");
}
