import { describe, expect, it } from "vitest";

import { getPhoneIssue } from "./phone";

// Paso 8.7 -- primer test de este archivo. getPhoneIssue distingue los
// dos motivos por los que un teléfono no sirve para un comunicado
// (faltante vs. formato inválido), reemplazando el `!!phoneE164` que
// trataba los dos casos igual en todo el flujo de comunicados.
describe("getPhoneIssue", () => {
  it("devuelve 'missing' para null", () => {
    expect(getPhoneIssue(null)).toBe("missing");
  });

  it("devuelve null (válido) para un E.164 argentino real", () => {
    expect(getPhoneIssue("+5493511234567")).toBeNull();
  });

  it("devuelve 'invalid_format' para un teléfono sin el prefijo +549", () => {
    expect(getPhoneIssue("+5411234567")).toBe("invalid_format");
    expect(getPhoneIssue("3511234567")).toBe("invalid_format");
  });

  it("devuelve 'invalid_format' para un teléfono demasiado corto", () => {
    expect(getPhoneIssue("+54123456")).toBe("invalid_format");
  });

  it("devuelve 'invalid_format' para un teléfono con espacios o guiones sin normalizar", () => {
    // getPhoneIssue prueba el valor CRUDO tal como está guardado -- no
    // normaliza primero (ver el comentario de la función): si necesita
    // normalizarse para matchear, ya cuenta como mal formateado desde la
    // perspectiva de esta app.
    expect(getPhoneIssue("+549 351 123-4567")).toBe("invalid_format");
  });

  it("devuelve 'missing' para un string vacío", () => {
    expect(getPhoneIssue("")).toBe("missing");
  });
});
