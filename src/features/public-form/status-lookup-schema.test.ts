import { describe, expect, it } from "vitest";

import {
  PUBLIC_CODE_REGEX,
  PUBLIC_TICKET_STATUS_LABEL,
  ticketStatusLookupSchema,
} from "./status-lookup-schema";

const VALID_TOKEN = "3f1e8c2a-9b4d-4e6f-8a1b-2c3d4e5f6a7b";

describe("ticketStatusLookupSchema (paso 11.1)", () => {
  it("acepta un token uuid + código bien formado", () => {
    const parsed = ticketStatusLookupSchema.safeParse({
      token: VALID_TOKEN,
      publicCode: "TC-2026-0007",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.publicCode).toBe("TC-2026-0007");
    }
  });

  it("normaliza el código: recorta espacios y pasa a mayúsculas", () => {
    const parsed = ticketStatusLookupSchema.safeParse({
      token: VALID_TOKEN,
      publicCode: "  tc-2026-0007  ",
    });
    expect(parsed.success && parsed.data.publicCode).toBe("TC-2026-0007");
  });

  it("rechaza un código con formato equivocado (sin pistas de por qué)", () => {
    for (const bad of [
      "TC-2026-7", // NNNN incompleto
      "T-2026-0007", // prefijo de 1 letra
      "TCABC-2026-0007", // prefijo de 5 letras
      "TC-26-0007", // año de 2 dígitos
      "TC20260007", // sin guiones
      "TC-2026-0007-1", // cola de más
      "",
    ]) {
      expect(
        ticketStatusLookupSchema.safeParse({
          token: VALID_TOKEN,
          publicCode: bad,
        }).success,
      ).toBe(false);
    }
  });

  it("rechaza un token que no es uuid", () => {
    expect(
      ticketStatusLookupSchema.safeParse({
        token: "no-es-uuid",
        publicCode: "TC-2026-0007",
      }).success,
    ).toBe(false);
  });
});

describe("PUBLIC_CODE_REGEX", () => {
  it("matchea PREFIJO(2-4)-AÑO(4)-NNNN(4) en mayúsculas", () => {
    expect(PUBLIC_CODE_REGEX.test("TC-2026-0001")).toBe(true);
    expect(PUBLIC_CODE_REGEX.test("ABCD-2026-9999")).toBe(true);
  });

  it("no matchea minúsculas ni espacios (la normalización va antes)", () => {
    expect(PUBLIC_CODE_REGEX.test("tc-2026-0001")).toBe(false);
    expect(PUBLIC_CODE_REGEX.test("TC-2026-0001 ")).toBe(false);
  });
});

describe("PUBLIC_TICKET_STATUS_LABEL", () => {
  it("cubre los CINCO valores del enum real de la base", () => {
    expect(Object.keys(PUBLIC_TICKET_STATUS_LABEL).sort()).toEqual(
      ["closed", "discarded", "in_progress", "new", "resolved"].sort(),
    );
  });

  it("usa vocabulario para el vecino, no el del panel", () => {
    expect(PUBLIC_TICKET_STATUS_LABEL.new).toBe("Recibido");
    expect(PUBLIC_TICKET_STATUS_LABEL.in_progress).toBe("En curso");
    // "discarded" no se muestra como el seco "Descartado" del panel.
    expect(PUBLIC_TICKET_STATUS_LABEL.discarded).not.toBe("Descartado");
    for (const label of Object.values(PUBLIC_TICKET_STATUS_LABEL)) {
      expect(label.length).toBeGreaterThan(0);
    }
  });
});
