import { describe, expect, it } from "vitest";

import {
  applyTemplateVariables,
  extractPlaceholderTokens,
  getAnnouncementTemplate,
  resolveRecipientPlaceholders,
} from "./templates";

// applyTemplateVariables/extractPlaceholderTokens son las dos funciones
// puras del paso 8.3 (`templates.ts` no importa "server-only" -- mismo
// motivo que normalize-ticket-text.ts, paso 7.1: testeables sin
// infraestructura de servidor). El contrato que estos tests documentan es
// el mismo que describe CLAUDE.md > Editor de comunicados: las variables
// DE COMUNICADO se sustituyen acá; cualquier `{{token}}` que sobreviva es,
// por construcción, un placeholder POR DESTINATARIO que el paso 8.5 tiene
// que resolver -- estos casos prueban esa frontera, no solo el feliz.
describe("applyTemplateVariables", () => {
  it("sustituye las variables de comunicado y deja los placeholders por destinatario intactos", () => {
    const result = applyTemplateVariables(
      "Hola {{nombre}}, el corte es el {{fecha}}. Tu unidad es {{unidad}}.",
      { fecha: "15/09/2026" },
    );
    expect(result).toBe(
      "Hola {{nombre}}, el corte es el 15/09/2026. Tu unidad es {{unidad}}.",
    );
  });

  it("sustituye un placeholder que aparece repetido más de una vez en el mismo cuerpo", () => {
    const result = applyTemplateVariables(
      "El {{fecha}} es el día del corte. Repetimos: {{fecha}} es la fecha a recordar.",
      { fecha: "20/09/2026" },
    );
    expect(result).toBe(
      "El 20/09/2026 es el día del corte. Repetimos: 20/09/2026 es la fecha a recordar.",
    );
  });

  it("no rompe el reemplazo con comillas ni tildes en el valor de la variable", () => {
    const result = applyTemplateVariables("Motivo: {{motivo}}.", {
      motivo: 'reparación de la bomba de "presión" del tanque',
    });
    expect(result).toBe(
      'Motivo: reparación de la bomba de "presión" del tanque.',
    );
  });

  it("deja el placeholder intacto si la clave no vino en los valores (defensivo)", () => {
    expect(applyTemplateVariables("Hola {{nombre}}, {{fecha}}", {})).toBe(
      "Hola {{nombre}}, {{fecha}}",
    );
  });

  it("deja el placeholder intacto si el valor es vacío o solo espacios", () => {
    expect(applyTemplateVariables("Fecha: {{fecha}}", { fecha: "   " })).toBe(
      "Fecha: {{fecha}}",
    );
  });

  it("combina las cuatro variables de la plantilla real de corte de agua", () => {
    const template = getAnnouncementTemplate("corte-de-agua");
    expect(template).toBeDefined();

    const result = applyTemplateVariables(template!.bodyTemplate, {
      fecha: "15/09/2026",
      horarioDesde: "09:00",
      horarioHasta: "13:00",
      motivo: "trabajos de mantenimiento en la cisterna",
    });

    expect(result).toContain("15/09/2026 vamos a cortar");
    expect(result).toContain("de 09:00 a 13:00hs");
    expect(result).toContain("trabajos de mantenimiento en la cisterna");
    expect(result).toContain("{{nombre}}");
    expect(result).toContain("{{unidad}}");
  });
});

describe("extractPlaceholderTokens", () => {
  it("extrae múltiples placeholders distintos en el orden en que aparecen", () => {
    expect(
      extractPlaceholderTokens("Hola {{nombre}}, tu unidad es {{unidad}}."),
    ).toEqual(["nombre", "unidad"]);
  });

  it("no duplica un token que aparece más de una vez", () => {
    expect(
      extractPlaceholderTokens(
        "{{nombre}}, este aviso es para {{nombre}} -- unidad {{unidad}}.",
      ),
    ).toEqual(["nombre", "unidad"]);
  });

  it("devuelve un array vacío sin placeholders en el texto", () => {
    expect(extractPlaceholderTokens("Texto sin ninguna variable.")).toEqual([]);
  });
});

// resolveRecipientPlaceholders es la función del paso 8.4 que resuelve lo
// que applyTemplateVariables (paso 8.3) dejó sin tocar a propósito -- estos
// casos prueban que dos personas distintas del mismo segmento producen
// mensajes distintos entre sí (el requisito central de la vista previa) y
// la frontera de qué pasa cuando falta un dato o el placeholder no se
// reconoce.
describe("resolveRecipientPlaceholders", () => {
  it("resuelve nombre y unidad contra los datos reales de una persona", () => {
    const result = resolveRecipientPlaceholders(
      "Hola {{nombre}}, esto es para tu unidad {{unidad}}.",
      { nombre: "Roberto López", unidad: "Norte - 4°A" },
    );
    expect(result).toBe(
      "Hola Roberto López, esto es para tu unidad Norte - 4°A.",
    );
  });

  it("dos personas distintas del mismo cuerpo producen mensajes distintos", () => {
    const body = "Hola {{nombre}}, tu unidad es {{unidad}}.";
    const a = resolveRecipientPlaceholders(body, {
      nombre: "Roberto López",
      unidad: "Norte - 4°A",
    });
    const b = resolveRecipientPlaceholders(body, {
      nombre: "Claudia Rojas",
      unidad: "Sur - 2°B",
    });
    expect(a).not.toBe(b);
    expect(a).toBe("Hola Roberto López, tu unidad es Norte - 4°A.");
    expect(b).toBe("Hola Claudia Rojas, tu unidad es Sur - 2°B.");
  });

  it("usa el texto de fallback visible cuando la unidad es null, sin dejar el placeholder crudo", () => {
    const result = resolveRecipientPlaceholders(
      "Hola {{nombre}}, tu unidad es {{unidad}}.",
      { nombre: "Claudia Rojas", unidad: null },
    );
    expect(result).toBe(
      "Hola Claudia Rojas, tu unidad es (sin unidad asignada).",
    );
    expect(result).not.toContain("{{unidad}}");
  });

  it("resuelve un placeholder repetido más de una vez con el mismo valor", () => {
    const result = resolveRecipientPlaceholders(
      "{{nombre}}, repetimos: {{nombre}}, no falte a la asamblea.",
      { nombre: "Ana Álvarez", unidad: null },
    );
    expect(result).toBe(
      "Ana Álvarez, repetimos: Ana Álvarez, no falte a la asamblea.",
    );
  });

  it("deja intacto un placeholder no reconocido (modo sin plantilla, tipeado a mano)", () => {
    const result = resolveRecipientPlaceholders(
      "Hola {{nombre}}, tu teléfono registrado es {{telefono}}.",
      { nombre: "Roberto López", unidad: "Norte - 4°A" },
    );
    expect(result).toBe(
      "Hola Roberto López, tu teléfono registrado es {{telefono}}.",
    );
  });

  it("un cuerpo sin ningún placeholder resuelve igual para todas las personas (texto libre sin variables)", () => {
    const body = "Feliz año nuevo a todos los vecinos del edificio.";
    const a = resolveRecipientPlaceholders(body, {
      nombre: "Roberto López",
      unidad: "Norte - 4°A",
    });
    const b = resolveRecipientPlaceholders(body, {
      nombre: "Claudia Rojas",
      unidad: null,
    });
    expect(a).toBe(body);
    expect(b).toBe(body);
  });
});
