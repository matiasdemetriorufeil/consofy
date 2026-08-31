import { describe, expect, it } from "vitest";

import {
  MAX_RESIDENT_UPDATE_TEXT,
  residentUpdateAddedPayloadSchema,
  residentUpdateTextSchema,
  summarizeResidentUpdate,
} from "./resident-update-schema";

describe("residentUpdateTextSchema (paso 11.4)", () => {
  it("recorta y conserva un texto con contenido", () => {
    const parsed = residentUpdateTextSchema.safeParse(
      "  el problema empeoró  ",
    );
    expect(parsed.success && parsed.data).toBe("el problema empeoró");
  });

  it("vacío / solo espacios / ausente -> null", () => {
    for (const value of ["", "   ", undefined]) {
      const parsed = residentUpdateTextSchema.safeParse(value);
      expect(parsed.success && parsed.data).toBeNull();
    }
  });

  it("rechaza un texto más largo que el tope", () => {
    expect(
      residentUpdateTextSchema.safeParse(
        "x".repeat(MAX_RESIDENT_UPDATE_TEXT + 1),
      ).success,
    ).toBe(false);
    expect(
      residentUpdateTextSchema.safeParse("x".repeat(MAX_RESIDENT_UPDATE_TEXT))
        .success,
    ).toBe(true);
  });
});

describe("summarizeResidentUpdate", () => {
  it("solo texto -> «información»", () => {
    expect(summarizeResidentUpdate("algo", 0)).toBe("información");
  });

  it("solo fotos -> «N foto(s)» con plural correcto", () => {
    expect(summarizeResidentUpdate(null, 1)).toBe("1 foto");
    expect(summarizeResidentUpdate("", 3)).toBe("3 fotos");
  });

  it("texto + fotos -> «información y N fotos»", () => {
    expect(summarizeResidentUpdate("algo", 2)).toBe("información y 2 fotos");
    expect(summarizeResidentUpdate("algo", 1)).toBe("información y 1 foto");
  });

  it("nada -> cae a «información» (no debería pasar, pero no rompe)", () => {
    expect(summarizeResidentUpdate(null, 0)).toBe("información");
  });
});

describe("residentUpdateAddedPayloadSchema", () => {
  it("acepta la forma que escribe la Server Action", () => {
    expect(
      residentUpdateAddedPayloadSchema.safeParse({
        text: "hola",
        photoCount: 2,
      }).success,
    ).toBe(true);
    expect(
      residentUpdateAddedPayloadSchema.safeParse({ text: null, photoCount: 0 })
        .success,
    ).toBe(true);
  });

  it("rechaza un photoCount negativo o no entero", () => {
    expect(
      residentUpdateAddedPayloadSchema.safeParse({ text: null, photoCount: -1 })
        .success,
    ).toBe(false);
    expect(
      residentUpdateAddedPayloadSchema.safeParse({
        text: null,
        photoCount: 1.5,
      }).success,
    ).toBe(false);
  });
});
