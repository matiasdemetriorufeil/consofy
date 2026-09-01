import { describe, expect, it } from "vitest";

import { l2Norm, normalizeVector } from "./vector-math";

describe("l2Norm", () => {
  it("calcula la norma euclídea", () => {
    expect(l2Norm([3, 4])).toBe(5);
    expect(l2Norm([0, 0, 0])).toBe(0);
    expect(l2Norm([1, 0, 0])).toBe(1);
  });
});

describe("normalizeVector", () => {
  it("deja un vector con norma L2 == 1 (dentro de epsilon)", () => {
    const out = normalizeVector([3, 4]);
    expect(l2Norm(out)).toBeCloseTo(1, 12);
    expect(out).toEqual([0.6, 0.8]);
  });

  it("un vector ya unitario queda igual", () => {
    const unit = [0, 1, 0];
    expect(normalizeVector(unit)).toEqual(unit);
  });

  it("un vector de puros ceros se devuelve tal cual (no divide por cero)", () => {
    expect(normalizeVector([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it("normaliza un vector de 768 dimensiones al estilo de lo que devuelve Gemini (norma ~0.6)", () => {
    // 768 valores chicos, todos iguales: norma = sqrt(768) * 0.02 ~= 0.554
    const raw = Array.from({ length: 768 }, () => 0.02);
    const out = normalizeVector(raw);
    expect(out).toHaveLength(768);
    expect(l2Norm(out)).toBeCloseTo(1, 10);
  });
});
