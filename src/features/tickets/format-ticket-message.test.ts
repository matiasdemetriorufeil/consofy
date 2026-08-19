import { describe, expect, it } from "vitest";

import {
  DEFAULT_ATTACHMENTS_BASE_URL,
  DEFAULT_MAX_ENCODED_MESSAGE_LENGTH,
  formatTicketMessage,
  type TicketMessageInput,
} from "./format-ticket-message";

function baseInput(
  overrides: Partial<TicketMessageInput> = {},
): TicketMessageInput {
  return {
    buildingName: "Torre Central",
    neighborFirstName: "Ana",
    neighborLastName: "Gómez",
    unitLabel: "3°B",
    categoryName: "Plomería",
    priority: "high",
    description: "Pierde agua el caño de la cocina desde ayer a la noche.",
    attachmentsCount: 2,
    publicCode: "TC-2026-0025",
    ...overrides,
  };
}

describe("formatTicketMessage", () => {
  it("arma el bloque completo en el orden y formato de CLAUDE.md", () => {
    const message = formatTicketMessage(baseInput());

    expect(message).toBe(
      [
        "🏢 Edificio: Torre Central",
        "👤 Vecino: Ana Gómez",
        "🚪 Departamento: 3°B",
        "🔧 Categoría: Plomería",
        "⚠️ Prioridad: Alta",
        "📝 Problema: Pierde agua el caño de la cocina desde ayer a la noche.",
        `📷 Adjuntos: ${DEFAULT_ATTACHMENTS_BASE_URL}/s/TC-2026-0025`,
        "🔖 Código: TC-2026-0025",
      ].join("\n"),
    );
  });

  it("omite el apellido sin dejar un espacio de más", () => {
    const message = formatTicketMessage(baseInput({ neighborLastName: null }));
    expect(message).toContain("👤 Vecino: Ana");
    expect(message).not.toContain("Vecino: Ana ");
  });

  it("sin adjuntos, la línea de Adjuntos desaparece del todo (no queda vacía)", () => {
    const message = formatTicketMessage(baseInput({ attachmentsCount: 0 }));
    expect(message).not.toContain("Adjuntos");
    const lines = message.split("\n");
    expect(lines[lines.length - 1]).toBe("🔖 Código: TC-2026-0025");
  });

  it("respeta un baseUrl configurado para el link de adjuntos", () => {
    const message = formatTicketMessage(baseInput(), {
      baseUrl: "https://staging.consofy.app",
    });
    expect(message).toContain(
      "📷 Adjuntos: https://staging.consofy.app/s/TC-2026-0025",
    );
  });

  it.each([
    ["low", "Baja"],
    ["medium", "Media"],
    ["high", "Alta"],
    ["urgent", "Urgente"],
  ] as const)("traduce la prioridad %s como %s", (priority, expected) => {
    const message = formatTicketMessage(baseInput({ priority }));
    expect(message).toContain(`⚠️ Prioridad: ${expected}`);
  });

  it("nunca produce un mensaje que exceda el límite codificado configurado", () => {
    // Fuerza a superar el presupuesto por defecto (1900, ver
    // DEFAULT_MAX_ENCODED_MESSAGE_LENGTH): con los campos fijos de
    // baseInput() consumiendo ~383 codificados, esta descripción sola
    // (repetida 300 veces, ~27 codificados por repetición por los
    // espacios) suma varios miles -- de sobra para disparar el truncado.
    const longDescription = "Problema muy largo. ".repeat(300);
    const message = formatTicketMessage(
      baseInput({ description: longDescription }),
    );
    expect(encodeURIComponent(message).length).toBeLessThanOrEqual(
      DEFAULT_MAX_ENCODED_MESSAGE_LENGTH,
    );
    expect(message).toContain("…");
  });

  it("trunca respetando un límite configurado más chico, sin pasarse", () => {
    // 420 está por encima de lo que ya cuestan los campos fijos de
    // baseInput() codificados (~383, medido) más el largo mínimo de "…"
    // (9) -- así que hay margen real para truncar la descripción en vez de
    // vaciarla del todo, que es lo que se quiere ejercitar acá.
    const message = formatTicketMessage(baseInput(), {
      maxEncodedLength: 420,
    });
    expect(encodeURIComponent(message).length).toBeLessThanOrEqual(420);
    expect(message).toContain("…");
    // Los campos fijos (edificio, vecino, unidad, categoría, prioridad,
    // adjuntos, código) siguen todos presentes -- solo la descripción cede
    // espacio.
    expect(message).toContain("🏢 Edificio: Torre Central");
    expect(message).toContain("🔖 Código: TC-2026-0025");
  });

  it("con un límite menor al costo fijo del mensaje, la descripción queda vacía en vez de romper el formato", () => {
    // Caso límite documentado en format-ticket-message.ts: si
    // maxEncodedLength es MENOR que lo que ya cuestan los campos fijos
    // (~383 codificados para baseInput()), no queda presupuesto ni para
    // "…" -- la función no puede honrar ese límite (no hay nada más que
    // recortar), así que prioriza no romper el resto del mensaje: la
    // descripción queda vacía y el resto de los campos (en particular el
    // código de seguimiento) se mantiene intacto.
    const message = formatTicketMessage(baseInput(), {
      maxEncodedLength: 100,
    });
    expect(message).toContain("📝 Problema: \n");
    expect(message).toContain("🔖 Código: TC-2026-0025");
  });

  it("no trunca si la descripción ya entra en el presupuesto", () => {
    const message = formatTicketMessage(baseInput({ description: "Corto." }));
    expect(message).toContain("📝 Problema: Corto.");
    expect(message).not.toContain("…");
  });

  it("una descripción con muchos emojis no revienta el encoding ni corta un par subrogado", () => {
    // 🏢 es un par subrogado en UTF-16 (dos code units) -- repetirlo fuerza
    // el corte a caer, en algún punto, justo en el medio de uno si el
    // truncado fuera ingenuo (.slice() por índice de .length). Si eso
    // pasara, encodeURIComponent() de un subrogado suelto tira
    // "URIError: URI malformed" -- este test falla con esa excepción si el
    // truncado no fuera grafema-seguro.
    const description = "🏢".repeat(400);
    expect(() => formatTicketMessage(baseInput({ description }))).not.toThrow();

    const message = formatTicketMessage(baseInput({ description }));
    expect(message).toContain("…");
    // El resultado sigue siendo texto válido: ida y vuelta por
    // encode/decodeURIComponent sin excepción.
    expect(() => decodeURIComponent(encodeURIComponent(message))).not.toThrow();
  });

  it("una familia emoji (secuencia ZWJ) no se parte a la mitad al truncar", () => {
    // 👨‍👩‍👧‍👦 es UN solo grafema compuesto por varios code points unidos con
    // ZWJ (U+200D). Truncar por code point (en vez de por grafema real)
    // podría cortarlo a la mitad y dejar un emoji roto/huérfano.
    const family = "👨‍👩‍👧‍👦";
    const description = `${family} `.repeat(120);
    const message = formatTicketMessage(baseInput({ description }), {
      maxEncodedLength: 400,
    });
    const problemLine = message
      .split("\n")
      .find((line) => line.startsWith("📝 Problema:"));
    expect(problemLine).toBeDefined();
    // Sin family "rota": cualquier aparición de la secuencia ZWJ en el
    // resultado tiene que ser la familia completa, nunca un fragmento.
    const zwjFragments =
      problemLine!.match(/[\u{1F468}\u{1F469}\u{1F467}\u{1F466}]/gu) ?? [];
    const fullFamilies = problemLine!.match(/👨‍👩‍👧‍👦/gu) ?? [];
    expect(zwjFragments.length).toBe(fullFamilies.length * 4);
  });

  it("preserva saltos de línea y caracteres inusuales de la descripción sin romper el bloque", () => {
    const description =
      'Se rompió "el caño"\ny también\tgotea el techo — raro, ¿no?';
    const message = formatTicketMessage(baseInput({ description }));
    expect(message).toContain(description);
    expect(() => encodeURIComponent(message)).not.toThrow();
  });

  it("el código de seguimiento siempre está presente, incluso truncando fuerte", () => {
    const message = formatTicketMessage(
      baseInput({ description: "x".repeat(5000) }),
      {
        maxEncodedLength: 200,
      },
    );
    expect(message).toContain("🔖 Código: TC-2026-0025");
  });
});
