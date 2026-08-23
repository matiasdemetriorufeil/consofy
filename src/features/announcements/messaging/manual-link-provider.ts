import { BuildWhatsAppUrlError, buildWhatsAppUrl } from "@/lib/whatsapp-url";

import type {
  MessagingAttemptResult,
  MessagingMessage,
  MessagingProvider,
  MessagingRecipient,
} from "./messaging-provider";

// Implementación real de Fase 1 (paso 8.1) -- construye la URL de WhatsApp
// contra `api.whatsapp.com/send` para que el administrador la abra a mano
// (envío manual, uno por uno; ver el comentario de MessagingProvider).
//
// REUSA `buildWhatsAppUrl` de src/lib/whatsapp-url.ts (flujo de ENTRADA, paso
// 5.7/5.9b) en vez de reimplementar la construcción de la URL -- decisión
// documentada en el reporte del paso, resumen acá: esa función YA es
// genuinamente genérica (toma un teléfono + un texto ya armado, no conoce
// nada de "reclamos" ni de "avisos") y ya vive en src/lib/, el lugar
// correcto para utilidades transversales sin lógica de dominio (ver
// CLAUDE.md > Estructura de carpetas) -- no hacía falta moverla de lugar,
// solo importarla desde acá. Reconfirmado con curl (no solo citando el
// hallazgo del 5.9b) que `api.whatsapp.com/send` sigue sin corromper
// emojis ni saltos de línea para un mensaje con la forma de un aviso
// (emoji + "\n"), ver el reporte del paso 8.1 para la salida real.
//
// NO reusa la lógica de truncado de format-ticket-message.ts
// (`truncateDescriptionToFit`/`toGraphemes`): esas funciones son privadas
// (sin exportar) y están entrelazadas con el concepto de "campos fijos +
// presupuesto para la descripción" específico del mensaje de un reclamo --
// extraerlas habría significado tocar un archivo del flujo de entrada, que
// el enunciado pide no tocar. Un aviso no tiene campos fijos que
// preservar (es un texto único, título+cuerpo ya combinados por quien
// llame), así que el problema acá es más simple: truncar el mensaje
// ENTERO si excede el presupuesto. Se reescribe de cero, aplicando la
// MISMA lección (Intl.Segmenter por grafema + búsqueda binaria sobre el
// largo codificado, nunca por índice de caracteres ni por bytes).
const ELLIPSIS = "…";

// Mismo presupuesto medido en format-ticket-message.ts (paso 5.6): 2000
// (largo seguro de una URL cross-browser) - 100 (reserva para
// `https://api.whatsapp.com/send?phone=` + un E.164 de 15 dígitos +
// `&text=`, medido en 57, redondeado con margen) = 1900. Transferible tal
// cual: es el MISMO dominio (`api.whatsapp.com/send`, ver whatsapp-url.ts)
// el que arma la URL en los dos flujos, así que el overhead del link no
// cambió.
const WA_SAFE_URL_LENGTH = 2000;
const WA_LINK_OVERHEAD_RESERVE = 100;
export const DEFAULT_MAX_ENCODED_MESSAGE_LENGTH =
  WA_SAFE_URL_LENGTH - WA_LINK_OVERHEAD_RESERVE;

// Por qué no alcanza con .slice(): un emoji fuera del plano básico es un
// par subrogado en UTF-16 -- cortar por índice puede partir el par a la
// mitad, y encodeURIComponent() de un subrogado suelto TIRA una excepción
// ("URI malformed"), no devuelve algo raro. Intl.Segmenter con
// granularity: "grapheme" corta por caracter visual real, incluso
// secuencias compuestas (familias con ZWJ, emoji con modificador de tono
// de piel) -- mismo mecanismo ya probado en format-ticket-message.ts.
function toGraphemes(text: string): string[] {
  const segmenter = new Intl.Segmenter("es", { granularity: "grapheme" });
  return Array.from(segmenter.segment(text), (entry) => entry.segment);
}

// Búsqueda binaria sobre grafemas (no caracteres ni bytes): no hay relación
// lineal entre "cantidad de grafemas" y "largo codificado" -- un mensaje
// con muchos emojis/tildes gasta el presupuesto más rápido que uno en
// ASCII puro, así que no se puede calcular el corte con una regla de tres.
export function truncateMessageToFit(
  text: string,
  encodedBudget: number,
): string {
  const trimmed = text.trim();
  if (encodeURIComponent(trimmed).length <= encodedBudget) {
    return trimmed;
  }

  const ellipsisEncodedLength = encodeURIComponent(ELLIPSIS).length;
  if (encodedBudget <= ellipsisEncodedLength) {
    // Caso límite que no debería pasar en la práctica (el presupuesto ni
    // siquiera alcanza para la elipsis) -- se devuelve vacío en vez de
    // romper, mismo criterio que format-ticket-message.ts.
    return "";
  }

  const graphemes = toGraphemes(trimmed);
  let lo = 0;
  let hi = graphemes.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = `${graphemes.slice(0, mid).join("").trimEnd()}${ELLIPSIS}`;
    if (encodeURIComponent(candidate).length <= encodedBudget) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return `${graphemes.slice(0, lo).join("").trimEnd()}${ELLIPSIS}`;
}

// Sin `import "server-only"` a propósito, igual que console-provider.ts:
// no toca `env` ni la base, así que se puede testear con Vitest de forma
// directa (ver manual-link-provider.test.ts) sin el hook que stubea
// "server-only". `buildWhatsAppUrl`/`normalizePhoneInput` (su dependencia
// transitiva) tampoco tienen esa marca -- confirmado antes de escribir
// este archivo, no asumido.
export const manualLinkProvider: MessagingProvider = {
  id: "manual_link",
  async sendToRecipient(
    recipient: MessagingRecipient,
    message: MessagingMessage,
  ): Promise<MessagingAttemptResult> {
    const safeText = truncateMessageToFit(
      message.text,
      DEFAULT_MAX_ENCODED_MESSAGE_LENGTH,
    );

    try {
      const url = buildWhatsAppUrl(recipient.phoneE164, safeText);
      return { ok: true, url };
    } catch (error) {
      if (error instanceof BuildWhatsAppUrlError) {
        return { ok: false, error: error.message };
      }
      // No debería pasar (buildWhatsAppUrl documenta que este es su único
      // tipo de error) -- si algún día tira otra cosa, no se disfraza como
      // un resultado normal.
      throw error;
    }
  },
};
