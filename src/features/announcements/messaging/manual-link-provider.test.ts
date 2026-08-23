import { describe, expect, it } from "vitest";

import {
  DEFAULT_MAX_ENCODED_MESSAGE_LENGTH,
  manualLinkProvider,
  truncateMessageToFit,
} from "./manual-link-provider";

// Función auxiliar de los tests: extrae el parámetro `text` crudo de una
// URL de api.whatsapp.com/send (sin decodificar) -- para poder comparar
// contra lo que armó la propia función, y por separado confirmar que
// decodeURIComponent() sobre eso reconstruye el original.
function extractRawTextParam(url: string): string {
  const match = url.match(/[?&]text=([^&]*)/);
  if (!match) {
    throw new Error(`No se encontró el parámetro text en: ${url}`);
  }
  return match[1]!;
}

describe("manualLinkProvider", () => {
  it("un mensaje con emojis y saltos de línea produce una URL que, decodificada, reconstruye el texto original sin corrupción", async () => {
    const original =
      "📢 Aviso importante\n\nEl próximo lunes se corta el agua de 9 a 13hs por trabajos de mantenimiento. 🔧💧\n\nGracias por la comprensión 🙏";

    const result = await manualLinkProvider.sendToRecipient(
      {
        personId: "p1",
        displayName: "Vecina de prueba",
        phoneE164: "+5493511112223",
      },
      { text: original },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.url).not.toBeNull();
    const url = result.url!;

    // Dominio correcto -- nunca wa.me (ver el bug confirmado con curl en
    // el reporte del paso, el mismo que ya documentó el paso 5.9b para el
    // flujo de entrada).
    expect(url.startsWith("https://api.whatsapp.com/send?")).toBe(true);
    expect(url).not.toContain("wa.me");

    const rawText = extractRawTextParam(url);
    const decoded = decodeURIComponent(rawText);
    expect(decoded).toBe(original);
  });

  it("el teléfono viaja sin '+' y sin símbolos, como query param `phone`", async () => {
    const result = await manualLinkProvider.sendToRecipient(
      {
        personId: "p2",
        displayName: "Vecino de prueba",
        phoneE164: "+5493511112223",
      },
      { text: "Hola" },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.url).toContain("phone=5493511112223");
  });

  it("teléfono vacío o corrupto: falla con un error legible, no lanza una excepción", async () => {
    const result = await manualLinkProvider.sendToRecipient(
      {
        personId: "p3",
        displayName: "Vecino sin teléfono válido",
        phoneE164: "",
      },
      { text: "Hola" },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("vacío");
  });

  it("truncateMessageToFit: un mensaje corto no se toca", () => {
    expect(truncateMessageToFit("Hola mundo", 1900)).toBe("Hola mundo");
  });

  it("truncateMessageToFit: trunca por GRAFEMA (no por índice), sin partir un emoji a la mitad, y el resultado sigue siendo codificable", () => {
    // "🏢" pesa 12 caracteres codificados (4 bytes UTF-8) -- con un
    // presupuesto muy chico, un corte por índice de caracter partiría el
    // par subrogado a la mitad y encodeURIComponent() tiraría "URI
    // malformed". Repetimos el emoji muchas veces para forzar el corte
    // justo en un punto no alineado a caracteres UTF-16 si se cortara mal.
    const message = "🏢".repeat(50) + " fin";
    const budget = 100; // fuerza truncamiento bien adentro del texto

    const truncated = truncateMessageToFit(message, budget);

    expect(() => encodeURIComponent(truncated)).not.toThrow();
    expect(encodeURIComponent(truncated).length).toBeLessThanOrEqual(budget);
    expect(truncated.endsWith("…")).toBe(true);
    // Ningún grafema partido: cada "🏢" que sobrevivió al corte tiene que
    // seguir siendo el emoji completo, no una mitad de par subrogado.
    const withoutEllipsis = truncated.slice(0, -1);
    expect(withoutEllipsis.length % 2).toBe(0); // "🏢" = 2 unidades UTF-16
  });

  it("un mensaje que excede DEFAULT_MAX_ENCODED_MESSAGE_LENGTH llega truncado a la URL final, y esa URL sigue siendo decodificable sin corrupción", async () => {
    const longMessage = `📢 ${"Aviso muy largo con muchas palabras repetidas. ".repeat(80)}🙏`;
    expect(encodeURIComponent(longMessage).length).toBeGreaterThan(
      DEFAULT_MAX_ENCODED_MESSAGE_LENGTH,
    );

    const result = await manualLinkProvider.sendToRecipient(
      { personId: "p4", displayName: "Vecino", phoneE164: "+5493511112223" },
      { text: longMessage },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rawText = extractRawTextParam(result.url!);
    // No debe tirar -- confirma que no quedó un subrogado partido.
    const decoded = decodeURIComponent(rawText);
    expect(decoded.length).toBeLessThan(longMessage.length);
    expect(decoded.endsWith("…")).toBe(true);
    expect(decoded.startsWith("📢")).toBe(true);
  });
});
