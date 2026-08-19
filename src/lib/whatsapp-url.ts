import { normalizePhoneInput } from "./phone";

// Constructor del link de WhatsApp (paso 5.7) -- AISLADO A PROPÓSITO. El
// plan lo marca como riesgo R9: si Meta cambia el dominio, el formato del
// número o el nombre del parámetro de texto, ESTE es el único archivo del
// proyecto que hay que tocar. Por eso el dominio/template de la URL vive en
// UNA sola constante acá abajo (WA_LINK_BASE_URL), no repetido en ningún
// componente ni Server Action -- ningún otro lugar del código arma un link
// de WhatsApp a mano (ver CLAUDE.md > Reglas de WhatsApp).
//
// Vive en src/lib/, no en src/features/tickets/: a diferencia de
// formatTicketMessage() (paso 5.6, que sabe qué es un "ticket"), esta
// función no conoce nada del dominio -- toma un teléfono y un texto ya
// armado, nada más. Mismo criterio que separa utilidades transversales de
// lógica de negocio (ver CLAUDE.md > Estructura de carpetas).

// --- Dominio: api.whatsapp.com/send, NO wa.me -- cambiado en el paso
// 5.9b tras encontrar un bug real de wa.me, medido con curl, no con el
// navegador (ver CLAUDE.md > Bug de emojis en wa.me, paso 5.9b, para el
// diagnóstico completo con salidas literales) ---
//
// `wa.me` hace un redirect 302 a `api.whatsapp.com/send/` -- y en ESE
// redirect, el propio servidor de `wa.me` corrompe CUALQUIER emoji del
// parámetro `text` a un único caracter de reemplazo (U+FFFD, "�"), sin
// importar cuántos bytes UTF-8 ocupara el emoji original (probado con
// emojis de 3 y 4 bytes, con variation selector, y compuestos con ZWJ --
// los cuatro se corrompen igual). El resto del texto (letras, tildes,
// puntuación) pasa intacto -- el bug es específico de los emojis, no de
// todo lo no-ASCII. Confirmado que la corrupción ocurre en el redirect
// mismo (el `Location` que devuelve `wa.me` ya llega con `%EF%BF%BD` en
// vez del emoji original), así que todo lo que viene DESPUÉS de ese
// redirect -- la página de `api.whatsapp.com`, el link real "Continuar a
// la conversación" (`web.whatsapp.com/send/?...`), el deep link
// `whatsapp://send/?...` que abre la app en el celular -- hereda esa
// corrupción sin ninguna forma de recuperarla.
//
// Yendo DIRECTO a `api.whatsapp.com/send` (sin pasar por `wa.me`) el texto
// llega intacto de punta a punta: confirmado extrayendo el link funcional
// real de la página (`id="action-button"`, el que dice "Continuar a la
// conversación" en desktop) y el deep link `whatsapp://send/?phone=...
// &text=...` que la página arma para abrir la app en un celular (embebido
// en un bloque JSON interno de la página, con el emoji codificado byte a
// byte igual al original) -- los dos, con los cuatro tipos de emoji
// probados, sin corromper nada.
//
// Dominio/formato base, verificados contra documentación (WhatsApp Help
// Center, "How to use click to chat", faq.whatsapp.com/5913398998672934,
// citada en el paso 5.7): el mismo parámetro `?text=urlencodedtext`, el
// mismo formato de número (dígitos puros, sin "+"). Lo único que cambia
// del paso 5.7 es el HOST -- `api.whatsapp.com/send` en vez de `wa.me` --
// justo para evitar el redirect donde está el bug.
//
// Formato del número: SIN "+", sin ceros/guiones/espacios/paréntesis --
// dígitos puros, país + área + número como un solo string. Los números de
// este proyecto ya llegan como E.164 con "+" (`AR_WHATSAPP_E164_REGEX`,
// src/lib/phone.ts) -- este módulo le saca el "+" y normaliza cualquier
// resto de puntuación antes de armar la URL.
const WA_LINK_BASE_URL = "https://api.whatsapp.com/send";

export class BuildWhatsAppUrlError extends Error {}

// Deja SOLO dígitos: reusa normalizePhoneInput (ya le saca espacios,
// paréntesis, puntos y guiones -- src/lib/phone.ts) y además saca el "+"
// inicial, que normalizePhoneInput no toca porque las validaciones E.164
// del resto del proyecto sí lo necesitan. Cualquier caracter que no sea un
// dígito después de esto es una señal de un número mal cargado -- no algo
// que este módulo intente adivinar o corregir.
function toWhatsAppDigits(rawPhone: string): string {
  const withoutSymbols = normalizePhoneInput(rawPhone.trim());
  const digits = withoutSymbols.startsWith("+")
    ? withoutSymbols.slice(1)
    : withoutSymbols;
  return digits;
}

// Por qué esta función NO valida el formato argentino completo
// (AR_WHATSAPP_E164_REGEX): esa validación ya vive en la capa de entrada de
// datos -- building-schema.ts (Zod, paso 4.1) al crear/editar un edificio,
// más el CHECK genérico de la base (`buildings_admin_whatsapp_e164_format`,
// E.164 amplio, no específico de Argentina -- ver src/db/schema/
// buildings.ts). Repetir la regla de "qué es un WhatsApp argentino válido"
// acá adentro rompería justo el aislamiento que este paso pide: mañana, si
// el proyecto acepta administradores de otro país, esa regla cambia en
// building-schema.ts, un archivo de dominio -- no debería hacer falta
// tocar el módulo de mecánica de wa.me para eso. Lo que SÍ valida acá es
// más angosto y no específico de ningún país: que después de sacar
// símbolos y el "+" quede una secuencia no vacía de dígitos. Es la defensa
// contra "el campo está vacío o corrupto" que pide el enunciado -- no una
// segunda validación de negocio.
function assertUsableDigits(digits: string, rawPhone: string): void {
  if (digits.length === 0) {
    throw new BuildWhatsAppUrlError(
      `El WhatsApp del administrador está vacío o no tiene ningún dígito (valor recibido: ${JSON.stringify(rawPhone)}). No se puede armar el link de WhatsApp.`,
    );
  }
  if (!/^\d+$/.test(digits)) {
    throw new BuildWhatsAppUrlError(
      `El WhatsApp del administrador tiene caracteres que no son dígitos después de normalizarlo (valor recibido: ${JSON.stringify(rawPhone)}, quedó "${digits}"). No se puede armar el link de WhatsApp.`,
    );
  }
}

// Función pura: arma la URL de WhatsApp con el número del administrador y
// el mensaje YA formateado (ver formatTicketMessage, paso 5.6 -- ese paso
// ya se encargó de que el texto entre en el largo seguro de un link; esta
// función no vuelve a medir nada de eso, solo codifica y arma la URL).
//
// El campo es NOT NULL desde el paso 4.1 (`buildings.admin_whatsapp_e164`)
// y Zod lo exige al cargar un edificio -- pero esta función no confía en
// que esas dos garantías se hayan cumplido de verdad para CADA fila real
// (una migración vieja, un dato cargado antes de que existiera esa
// validación, un test, un futuro caller que no pase por el schema): si
// llega vacío o corrupto, tira `BuildWhatsAppUrlError` en vez de devolver
// un link roto o silenciosamente inválido -- un botón "Enviar por
// WhatsApp" que abre un link sin número es peor que no mostrar el botón,
// porque el vecino cree que hizo algo cuando en realidad no pasó nada.
export function buildWhatsAppUrl(
  adminWhatsappE164: string,
  message: string,
): string {
  const digits = toWhatsAppDigits(adminWhatsappE164);
  assertUsableDigits(digits, adminWhatsappE164);

  let encodedMessage: string;
  try {
    encodedMessage = encodeURIComponent(message);
  } catch {
    // Mismo riesgo que documentó el paso 5.6: un string con un subrogado
    // suelto (una mitad de emoji) hace que encodeURIComponent() TIRE, no
    // que devuelva algo raro. formatTicketMessage() ya garantiza que esto
    // no pasa con sus propios mensajes (trunca por grafema completo, nunca
    // a la mitad) -- este catch es la defensa para un caller que arme el
    // texto por otro lado y no respete esa garantía.
    throw new BuildWhatsAppUrlError(
      "El mensaje tiene caracteres inválidos (posiblemente un emoji cortado a la mitad) y no se pudo codificar para la URL.",
    );
  }

  // `api.whatsapp.com/send` recibe el número por QUERY STRING
  // (`?phone=...`), no como segmento de ruta -- a diferencia de `wa.me/
  // <número>`. Confirmado con curl (ver el comentario de
  // WA_LINK_BASE_URL): esta forma exacta, sin barra final, ya produce el
  // link "Continuar a la conversación" y el deep link `whatsapp://send/`
  // correctos, con el texto intacto.
  return `${WA_LINK_BASE_URL}?phone=${digits}&text=${encodedMessage}`;
}
