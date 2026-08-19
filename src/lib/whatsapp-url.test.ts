import { describe, expect, it } from "vitest";

import { formatTicketMessage } from "@/features/tickets/format-ticket-message";

import { BuildWhatsAppUrlError, buildWhatsAppUrl } from "./whatsapp-url";

describe("buildWhatsAppUrl", () => {
  it("arma un link wa.me con el número E.164 sin el '+' y el mensaje codificado", () => {
    const url = buildWhatsAppUrl(
      "+5493511234567",
      "Hola, tenés un reclamo nuevo.",
    );
    expect(url).toBe(
      "https://wa.me/5493511234567?text=Hola%2C%20ten%C3%A9s%20un%20reclamo%20nuevo.",
    );
  });

  it("usa el dominio wa.me, no api.whatsapp.com", () => {
    const url = buildWhatsAppUrl("+5493511234567", "hola");
    expect(url.startsWith("https://wa.me/")).toBe(true);
  });

  it("normaliza espacios, guiones y paréntesis en el número antes de armar el link", () => {
    const url = buildWhatsAppUrl("+54 9 (351) 123-4567", "hola");
    expect(url).toBe("https://wa.me/5493511234567?text=hola");
  });

  it("no re-valida el formato argentino específico -- un E.164 de otro país arma el link igual", () => {
    // Esa validación vive en building-schema.ts (Zod, paso 4.1), no acá --
    // ver el comentario de assertUsableDigits en whatsapp-url.ts. Un
    // número brasilero (+55) no es "inválido" para ESTE módulo, aunque
    // building-schema.ts nunca dejaría cargar uno hoy.
    const url = buildWhatsAppUrl("+5511987654321", "hola");
    expect(url).toBe("https://wa.me/5511987654321?text=hola");
  });

  it("tira BuildWhatsAppUrlError con el número vacío", () => {
    expect(() => buildWhatsAppUrl("", "hola")).toThrow(BuildWhatsAppUrlError);
  });

  it("tira BuildWhatsAppUrlError con el número compuesto solo por espacios/símbolos", () => {
    expect(() => buildWhatsAppUrl("   -- ()  ", "hola")).toThrow(
      BuildWhatsAppUrlError,
    );
  });

  it("tira BuildWhatsAppUrlError si después de normalizar quedan caracteres que no son dígitos", () => {
    expect(() => buildWhatsAppUrl("+549abc1234567", "hola")).toThrow(
      BuildWhatsAppUrlError,
    );
  });

  it("el error de número vacío/inválido incluye el valor recibido para poder diagnosticarlo", () => {
    expect(() => buildWhatsAppUrl("", "hola")).toThrow(/vacío/);
  });

  it("codifica saltos de línea del mensaje como %0A", () => {
    const url = buildWhatsAppUrl("+5493511234567", "línea 1\nlínea 2");
    expect(url).toContain("l%C3%ADnea%201%0Al%C3%ADnea%202");
  });

  it("codifica emojis del mensaje correctamente y el texto se puede decodificar de vuelta intacto", () => {
    const message = "Reclamo nuevo 🏢🔧 ¡urgente!";
    const url = buildWhatsAppUrl("+5493511234567", message);
    const textParam = new URL(url).searchParams.get("text");
    expect(textParam).toBe(message);
  });

  it("tira BuildWhatsAppUrlError (no un URIError crudo) si el mensaje trae un subrogado suelto", () => {
    // Medio par de un emoji astral (🏢 = 🏢), cortado a mano --
    // exactamente lo que formatTicketMessage() garantiza que nunca produce
    // (trunca por grafema completo), pero un caller que no pase por esa
    // función sí podría mandar. encodeURIComponent() de esto tira
    // "URIError: URI malformed" -- esta función lo envuelve en un error
    // propio y diagnosticable en vez de dejarlo pasar crudo.
    const brokenMessage = "Mensaje con emoji roto: \uD83C";
    expect(() => buildWhatsAppUrl("+5493511234567", brokenMessage)).toThrow(
      BuildWhatsAppUrlError,
    );
  });

  it("integra con el mensaje real de formatTicketMessage (paso 5.6) de punta a punta", () => {
    const message = formatTicketMessage({
      buildingName: "Torre Central",
      neighborFirstName: "Ana",
      neighborLastName: "Gómez",
      unitLabel: "3°B",
      categoryName: "Plomería",
      priority: "high",
      description: "Pierde agua el caño de la cocina desde ayer a la noche.",
      attachmentsCount: 2,
      publicCode: "TC-2026-0025",
    });

    const url = buildWhatsAppUrl("+5493511234567", message);

    expect(url.startsWith("https://wa.me/5493511234567?text=")).toBe(true);
    const decoded = new URL(url).searchParams.get("text");
    expect(decoded).toBe(message);
  });
});
