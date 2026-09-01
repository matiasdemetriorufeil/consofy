import { describe, expect, it } from "vitest";

import { composeTicketEmbeddingText } from "./compose-embedding-text";

describe("composeTicketEmbeddingText", () => {
  it("pone la categoría primero, después la descripción, separadas por línea en blanco", () => {
    expect(
      composeTicketEmbeddingText(
        "Ascensores",
        "El ascensor no anda desde ayer.",
      ),
    ).toBe("Ascensores\n\nEl ascensor no anda desde ayer.");
  });

  it("recorta el espacio sobrante de cada parte y de los bordes", () => {
    expect(
      composeTicketEmbeddingText("  Plomería  ", "  gotea el tanque  "),
    ).toBe("Plomería\n\ngotea el tanque");
  });

  it("no normaliza acentos ni mayúsculas (el modelo usa el texto natural)", () => {
    const text = composeTicketEmbeddingText(
      "Ruidos molestos",
      "TALADRO a las 7 AM el sábado, otra vez.",
    );
    expect(text).toContain("Ruidos molestos");
    expect(text).toContain("TALADRO");
    expect(text).toContain("sábado");
  });

  it("una descripción vacía deja solo la categoría, sin líneas colgando", () => {
    expect(composeTicketEmbeddingText("Otro", "")).toBe("Otro");
  });
});
