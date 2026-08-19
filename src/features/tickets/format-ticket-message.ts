import { toBadgePriority } from "./status-mapping";

// El bloque de texto que ve el administrador en WhatsApp (paso 5.6). Es lo
// ÚNICO que ve hasta que abre el panel -- ver CLAUDE.md > Reglas de
// WhatsApp: "el reclamo se guarda en la base ANTES de abrir WhatsApp,
// nunca después", y esta función ni sabe que WhatsApp existe. No arma el
// link `wa.me` (eso es un paso posterior, junto con `MessagingProvider`) --
// devuelve solo el TEXTO, con el largo ya acotado para que, cuando alguien
// lo meta en un link `wa.me`, ese link no se pase del tamaño seguro. Ver
// el reporte del paso 5.6 para la medición completa.

export type TicketMessagePriority = "low" | "medium" | "high" | "urgent";

// A propósito NO incluye unitId/categoryId ni nada de la forma de la base:
// esta función es de texto puro, no conoce Drizzle ni sabe unir tablas. El
// caller (quien SÍ tiene el ticket completo con sus relaciones) arma este
// objeto -- mismo criterio que ya separa "datos" de "presentación" en el
// resto del proyecto (ver toBadgeStatus/toBadgePriority en
// status-mapping.ts, un archivo distinto por el mismo motivo).
//
// unitLabel es siempre un string, nunca null: el CHECK
// tickets_unit_id_or_label_present (src/db/schema/tickets.ts) exige que
// TODO ticket tenga unit_id o unit_label_raw -- no existe, a nivel de base,
// un reclamo sin ninguna forma de identificar la unidad. El mensaje no
// tiene entonces una rama "sin unidad": ese caso no puede ocurrir, y
// modelarlo como si pudiera sería inventar una posibilidad que la propia
// base ya descarta.
export type TicketMessageInput = {
  buildingName: string;
  neighborFirstName: string;
  neighborLastName: string | null;
  unitLabel: string;
  categoryName: string;
  priority: TicketMessagePriority;
  description: string;
  attachmentsCount: number;
  publicCode: string;
};

export type FormatTicketMessageOptions = {
  baseUrl?: string;
  maxEncodedLength?: number;
};

// Forma que va a tener la ruta pública de adjuntos del paso 5.10 -- todavía
// no existe como código (ver `src/app/`, no hay ningún `src/app/s/`). "s"
// de "seguimiento", mismo patrón corto que `/r/[token]` (paso 5.1) para el
// formulario público. Un solo link para el reclamo entero (no uno aparte
// "solo fotos"): más corto, y esa página va a mostrar estado + fotos juntos
// de todas formas -- separarlos en dos links no le suma nada al
// administrador y sí le resta caracteres al presupuesto del mensaje.
export const ATTACHMENTS_ROUTE_PREFIX = "/s";
export const DEFAULT_ATTACHMENTS_BASE_URL = "https://consofy.app";

// --- Límite seguro, medido, no estimado (ver el reporte del paso 5.6) ---
//
// WhatsApp documenta 4096 caracteres como tope de un mensaje de texto
// (fuentes citadas en el reporte) -- pero ESE no es el límite que de
// verdad importa acá, porque el mensaje no viaja como texto plano: viaja
// codificado dentro de la query string de un link `wa.me`/
// `api.whatsapp.com`, y el estándar de facto para que un link funcione en
// cualquier navegador/SO es bastante más chico: ~2000 caracteres (Chrome),
// 2048 citado como tope "seguro" cross-browser (fuentes en el reporte). Es
// ESE el límite que gobierna acá, no el de WhatsApp.
//
// Medido en este mismo paso (no estimado): encodeURIComponent() expande
// cada caracter según cuántos bytes UTF-8 ocupa --
//   encodeURIComponent("a").length   === 1  (ASCII, 1 byte)
//   encodeURIComponent("á").length   === 6  (2 bytes -> "%XX%XX")
//   encodeURIComponent("🏢").length  === 12 (4 bytes -> "%XX%XX%XX%XX")
// -- así que un mensaje con tildes o emojis puede ocupar, codificado, hasta
// 12 veces su longitud "de texto". El presupuesto de esta función se mide
// SIEMPRE sobre el resultado de encodeURIComponent(), nunca sobre
// .length del string crudo -- lo otro subestimaría el tamaño real del link
// resultante.
const WA_SAFE_URL_LENGTH = 2000;

// Lo que el link le resta al presupuesto ANTES de llegar al texto: el
// prefijo (`https://api.whatsapp.com/send?phone=` mide 37, más largo que
// `https://wa.me/`, así que se usa el más conservador de los dos) + un
// teléfono E.164 en su longitud máxima (15 dígitos, el tope del estándar)
// + `&text=` (6). Medido: 37 + 15 + 6 = 58. Se redondea a 100 para dejar
// margen (un parámetro extra que agregue un paso futuro, por ejemplo).
const WA_LINK_OVERHEAD_RESERVE = 100;

export const DEFAULT_MAX_ENCODED_MESSAGE_LENGTH =
  WA_SAFE_URL_LENGTH - WA_LINK_OVERHEAD_RESERVE;

const ELLIPSIS = "…";

// Por qué no alcanza con .slice(): un emoji fuera del plano básico (como
// 🏢) es DOS unidades UTF-16 en un string de JS (un par subrogado)
// -- ["🏢".length es 2, no 1. Cortar con .slice(0, n) puede partir el par
// por la mitad, y encodeURIComponent() de un subrogado suelto directamente
// TIRA una excepción ("URI malformed") -- no es un caso hipotético, un
// test de este paso lo reproduce. Intl.Segmenter con granularity:
// "grapheme" corta por "caracter visual" real, incluso secuencias
// compuestas (emoji con modificador de tono de piel, familias con ZWJ),
// no por unidad UTF-16 ni por code point suelto.
function toGraphemes(text: string): string[] {
  const segmenter = new Intl.Segmenter("es", { granularity: "grapheme" });
  return Array.from(segmenter.segment(text), (entry) => entry.segment);
}

// Trunca por búsqueda binaria sobre grafemas (no sobre caracteres ni
// bytes), buscando el prefijo más largo cuya forma CODIFICADA (+ "…") entre
// en encodedBudget. Binaria porque no hay una relación lineal entre
// "cantidad de grafemas" y "largo codificado" -- un texto con muchos
// emojis/tildes gasta el presupuesto mucho más rápido que uno en ASCII
// puro, así que no se puede calcular la posición de corte con una regla de
// tres.
function truncateDescriptionToFit(
  description: string,
  encodedBudget: number,
): string {
  const trimmed = description.trim();
  if (encodeURIComponent(trimmed).length <= encodedBudget) {
    return trimmed;
  }

  const ellipsisEncodedLength = encodeURIComponent(ELLIPSIS).length;
  if (encodedBudget <= ellipsisEncodedLength) {
    // Caso límite que no debería pasar en la práctica (significaría que
    // los campos FIJOS del mensaje ya agotaron el presupuesto seguro antes
    // de que la descripción sume una sola letra) -- ver el reporte. No hay
    // forma honesta de mostrar ni un fragmento de la descripción acá.
    return "";
  }

  const units = toGraphemes(trimmed);
  let lo = 0;
  let hi = units.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = `${units.slice(0, mid).join("").trimEnd()}${ELLIPSIS}`;
    if (encodeURIComponent(candidate).length <= encodedBudget) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return `${units.slice(0, lo).join("").trimEnd()}${ELLIPSIS}`;
}

function formatPriority(priority: TicketMessagePriority): string {
  const word = toBadgePriority(priority);
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function buildLines(
  input: TicketMessageInput,
  description: string,
  baseUrl: string,
): string[] {
  const neighborName = [input.neighborFirstName, input.neighborLastName]
    .filter(Boolean)
    .join(" ");

  // Orden y emojis: EXACTAMENTE el formato ya acordado en el plan (ver
  // CLAUDE.md > Formato del mensaje al administrador) -- no se inventa un
  // orden nuevo acá.
  const lines = [
    `🏢 Edificio: ${input.buildingName}`,
    `👤 Vecino: ${neighborName}`,
    `🚪 Departamento: ${input.unitLabel}`,
    `🔧 Categoría: ${input.categoryName}`,
    `⚠️ Prioridad: ${formatPriority(input.priority)}`,
    `📝 Problema: ${description}`,
  ];

  // Sin adjuntos, la línea entera desaparece -- no "Adjuntos: ninguno".
  // Cada línea de más es una línea que se lee peor en un celular (pedido
  // explícito del enunciado); un campo vacío no le suma nada al
  // administrador, que ya puede asumir "sin foto" por su ausencia.
  if (input.attachmentsCount > 0) {
    lines.push(
      `📷 Adjuntos: ${baseUrl}${ATTACHMENTS_ROUTE_PREFIX}/${input.publicCode}`,
    );
  }

  lines.push(`🔖 Código: ${input.publicCode}`);
  return lines;
}

// Función pura: mismo input, mismo output, siempre -- sin fetch, sin Date
// "ahora", sin nada del entorno salvo lo que entra por parámetro. Eso es lo
// que la hace fácil de testear (paso 12.1 del plan la pide con tests) y
// reusable después tanto del lado del cliente (pantalla de confirmación
// del formulario público) como, eventualmente, del panel (reenviar el
// mismo mensaje).
export function formatTicketMessage(
  input: TicketMessageInput,
  options: FormatTicketMessageOptions = {},
): string {
  const baseUrl = options.baseUrl ?? DEFAULT_ATTACHMENTS_BASE_URL;
  const maxEncodedLength =
    options.maxEncodedLength ?? DEFAULT_MAX_ENCODED_MESSAGE_LENGTH;

  // Arma el mensaje con la descripción VACÍA primero para medir cuánto
  // presupuesto codificado ya consumen los campos fijos (edificio, vecino,
  // unidad, categoría, prioridad, adjuntos, código) -- lo que sobra es lo
  // único que le queda a la descripción.
  const fixedEncodedLength = encodeURIComponent(
    buildLines(input, "", baseUrl).join("\n"),
  ).length;
  const descriptionBudget = Math.max(0, maxEncodedLength - fixedEncodedLength);

  const description = truncateDescriptionToFit(
    input.description,
    descriptionBudget,
  );

  return buildLines(input, description, baseUrl).join("\n");
}
