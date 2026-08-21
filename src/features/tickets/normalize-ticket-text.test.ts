import { describe, expect, it } from "vitest";

import { normalizeTicketText } from "./normalize-ticket-text";

// normalizeTicketText vive en su propio módulo, separado de
// find-similar-tickets.ts -- que sí toca la base y lleva
// `import "server-only"` -- justo para que este test pueda importarla sin
// arrastrar esa dependencia (ver el comentario de ese archivo). El
// servicio findSimilarTickets() en sí se verifica contra datos reales del
// seed en el reporte del paso 7.1, no acá (mismo criterio que el resto del
// proyecto: sin infraestructura de tests de integración contra Postgres,
// ver CLAUDE.md > Mensaje al administrador). normalizeTicketText tiene que
// producir EXACTAMENTE el mismo resultado que el equivalente en SQL
// (normalizedColumnSql, find-similar-tickets.ts), así que estos casos son
// también la documentación viva de qué transforma y qué no.
describe("normalizeTicketText", () => {
  it("pasa a minúsculas", () => {
    expect(normalizeTicketText("El Ascensor")).toBe("el ascensor");
  });

  it("saca tildes de las siete letras acentuadas del español", () => {
    expect(normalizeTicketText("áéíóúñü ÁÉÍÓÚÑÜ")).toBe("aeiounu aeiounu");
  });

  it("colapsa espacios múltiples (incluidos tabs y saltos de línea) a uno solo", () => {
    expect(normalizeTicketText("el   ascensor\tno\nfrena")).toBe(
      "el ascensor no frena",
    );
  });

  it("recorta espacios al principio y al final", () => {
    expect(normalizeTicketText("   el ascensor   ")).toBe("el ascensor");
  });

  it("no toca puntuación (no fue pedido, pg_trgm ya la tolera)", () => {
    expect(normalizeTicketText("¡El ascensor, otra vez!")).toBe(
      "¡el ascensor, otra vez!",
    );
  });

  it("combina las cuatro transformaciones en un caso real del seed", () => {
    expect(
      normalizeTicketText(
        "El ascensor de la torre Norte se quedó trabado entre el 3er y 4to piso esta mañana",
      ),
    ).toBe(
      "el ascensor de la torre norte se quedo trabado entre el 3er y 4to piso esta manana",
    );
  });
});
