import { describe, expect, it } from "vitest";

import { formatTicketMessage } from "@/features/tickets/format-ticket-message";

import { BuildWhatsAppUrlError, buildWhatsAppUrl } from "./whatsapp-url";

describe("buildWhatsAppUrl", () => {
  it("arma un link con el número E.164 sin el '+' (como query param) y el mensaje codificado", () => {
    const url = buildWhatsAppUrl(
      "+5493511234567",
      "Hola, tenés un reclamo nuevo.",
    );
    expect(url).toBe(
      "https://api.whatsapp.com/send?phone=5493511234567&text=Hola%2C%20ten%C3%A9s%20un%20reclamo%20nuevo.",
    );
  });

  // Regresión deliberada (paso 5.9b): usa api.whatsapp.com/send, NO wa.me.
  // wa.me hace un redirect 302 que corrompe cualquier emoji del mensaje a
  // un único caracter de reemplazo (U+FFFD) ANTES de que el texto llegue
  // a ningún lado -- confirmado con curl contra los dos dominios, ver el
  // comentario de WA_LINK_BASE_URL en whatsapp-url.ts y CLAUDE.md > Bug de
  // emojis en wa.me para el diagnóstico completo con salidas literales.
  // Yendo directo a api.whatsapp.com/send el texto llega intacto de punta
  // a punta (confirmado con el link real "Continuar a la conversación" y
  // el deep link whatsapp://send/ que arma esa página). Este test no
  // puede probar el comportamiento de WhatsApp en sí (ver el bloque
  // "límite de lo que un test puede cubrir" más abajo) -- lo que SÍ puede,
  // y hace, es que nadie vuelva a cambiar el dominio a wa.me sin que un
  // test se rompa.
  it("usa api.whatsapp.com/send, NO wa.me -- wa.me corrompe los emojis en su redirect", () => {
    const url = buildWhatsAppUrl("+5493511234567", "hola");
    expect(url.startsWith("https://api.whatsapp.com/send?")).toBe(true);
    expect(url).not.toContain("wa.me");
  });

  it("normaliza espacios, guiones y paréntesis en el número antes de armar el link", () => {
    const url = buildWhatsAppUrl("+54 9 (351) 123-4567", "hola");
    expect(url).toBe(
      "https://api.whatsapp.com/send?phone=5493511234567&text=hola",
    );
  });

  it("no re-valida el formato argentino específico -- un E.164 de otro país arma el link igual", () => {
    // Esa validación vive en building-schema.ts (Zod, paso 4.1), no acá --
    // ver el comentario de assertUsableDigits en whatsapp-url.ts. Un
    // número brasilero (+55) no es "inválido" para ESTE módulo, aunque
    // building-schema.ts nunca dejaría cargar uno hoy.
    const url = buildWhatsAppUrl("+5511987654321", "hola");
    expect(url).toBe(
      "https://api.whatsapp.com/send?phone=5511987654321&text=hola",
    );
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
    // Esto prueba que ESTE proyecto codifica bien (lo mismo que ya
    // probaba antes del paso 5.9b) -- no prueba qué hace WhatsApp con eso
    // después. Ver el bloque de más abajo sobre el límite real de lo que
    // un test unitario puede cubrir acá.
    const message = "Reclamo nuevo 🏢🔧 ¡urgente!";
    const url = buildWhatsAppUrl("+5493511234567", message);
    const textParam = new URL(url).searchParams.get("text");
    expect(textParam).toBe(message);
  });

  it("codifica los cuatro tipos de emoji probados contra el bug de wa.me sin perder información", () => {
    // Mismos cuatro casos verificados con curl contra api.whatsapp.com/
    // send en el diagnóstico del paso 5.9b (3 bytes, 4 bytes astral, con
    // variation selector, compuesto con ZWJ) -- acá se prueba la mitad
    // que SÍ es responsabilidad de este código: que ida y vuelta por
    // encodeURIComponent/decodeURIComponent (lo mismo que hace
    // `new URL().searchParams.get()`) no pierde ni un byte. La otra
    // mitad (qué hace el SERVIDOR de WhatsApp con esos bytes) es
    // exactamente lo que curl ya confirmó por fuera de este test.
    const cases = {
      "3 bytes (corazón)": "❤",
      "4 bytes astral (edificio)": "🏢",
      "con variation selector (warning)": "⚠️",
      "compuesto ZWJ (familia)": "👨‍👩‍👧‍👦",
    };
    for (const [label, emoji] of Object.entries(cases)) {
      const url = buildWhatsAppUrl("+5493511234567", `probando ${emoji}`);
      const decoded = new URL(url).searchParams.get("text");
      expect(decoded, label).toBe(`probando ${emoji}`);
    }
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
      attachmentsToken: "a1111111-1111-1111-1111-111111111111",
    });

    const url = buildWhatsAppUrl("+5493511234567", message);

    expect(
      url.startsWith("https://api.whatsapp.com/send?phone=5493511234567&"),
    ).toBe(true);
    const decoded = new URL(url).searchParams.get("text");
    expect(decoded).toBe(message);
  });
});

// --- Límite de lo que un test automatizado puede cubrir acá ---
//
// Lo que NINGÚN test de este archivo puede probar (paso 5.9b, pedido
// explícito de no fingir cobertura donde no la hay): que WhatsApp
// (wa.me, api.whatsapp.com, la app, WhatsApp Web) siga preservando el
// emoji en el futuro. Eso depende del comportamiento de un servidor de
// un tercero (Meta), que puede cambiar sin aviso -- exactamente el mismo
// motivo por el que el dominio está aislado en una sola constante
// (riesgo R9, ver el comentario de WA_LINK_BASE_URL). Un test unitario
// no puede pegarle a wa.me/api.whatsapp.com en cada corrida (lento, y
// rompe la suite entera si el tercero está caído o cambia de
// comportamiento sin que sea un bug de ESTE código) -- por eso el
// diagnóstico de este paso se hizo con curl, a mano, documentado con
// salidas literales en CLAUDE.md, no con un test automático.
//
// Lo último que ningún curl puede confirmar tampoco: si WhatsApp APP
// real (o WhatsApp Web con una cuenta real logueada) efectivamente
// muestra el emoji en el campo de texto ya precargado -- eso hace falta
// probarlo con un teléfono real, no con este proyecto.
