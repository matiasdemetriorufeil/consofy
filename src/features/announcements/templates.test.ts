import { describe, expect, it } from "vitest";

import {
  applyTemplateVariables,
  extractPlaceholderTokens,
  getAnnouncementTemplate,
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
