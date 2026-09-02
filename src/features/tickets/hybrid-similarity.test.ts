import { describe, expect, it } from "vitest";

import {
  COMBINED_SIMILARITY_THRESHOLD,
  combineSimilarityScores,
  DEFAULT_COSINE_SIMILARITY_THRESHOLD,
  rescaleSimilarity,
} from "./hybrid-similarity";

describe("rescaleSimilarity", () => {
  it("mapea el umbral exactamente a 0.5", () => {
    expect(rescaleSimilarity(0.2, 0.2)).toBeCloseTo(0.5, 12);
    expect(rescaleSimilarity(0.78, 0.78)).toBeCloseTo(0.5, 12);
  });

  it("mapea [0, umbral] linealmente a [0, 0.5]", () => {
    expect(rescaleSimilarity(0, 0.2)).toBeCloseTo(0, 12);
    expect(rescaleSimilarity(0.1, 0.2)).toBeCloseTo(0.25, 12);
  });

  it("mapea [umbral, 1] linealmente a [0.5, 1]", () => {
    expect(rescaleSimilarity(1, 0.2)).toBeCloseTo(1, 12);
    expect(rescaleSimilarity(0.6, 0.2)).toBeCloseTo(0.75, 12);
    expect(rescaleSimilarity(0.89, 0.78)).toBeCloseTo(0.75, 12);
  });

  it("acota valores fuera de [0, 1]", () => {
    expect(rescaleSimilarity(-0.5, 0.2)).toBe(0);
    expect(rescaleSimilarity(2, 0.2)).toBe(1);
  });

  it("no explota con umbrales degenerados (0 o 1)", () => {
    expect(Number.isFinite(rescaleSimilarity(0.5, 0))).toBe(true);
    expect(Number.isFinite(rescaleSimilarity(0.5, 1))).toBe(true);
  });
});

describe("combineSimilarityScores", () => {
  const trigramThreshold = 0.2;

  it("sin embedding (coseno NULL): cae a trigram solo", () => {
    // trigram 0.3 con umbral 0.2 -> reescalado 0.5 + 0.5*(0.1/0.8) = 0.5625
    expect(
      combineSimilarityScores({
        trigramSimilarity: 0.3,
        cosineSimilarity: null,
        trigramThreshold,
      }),
    ).toBeCloseTo(0.5625, 6);
  });

  it("un trigram fuerte se marca aunque el coseno sea bajo (no lo tapa)", () => {
    const score = combineSimilarityScores({
      trigramSimilarity: 0.9,
      cosineSimilarity: 0.1,
      trigramThreshold,
    });
    expect(score).toBeGreaterThanOrEqual(COMBINED_SIMILARITY_THRESHOLD);
  });

  it("similitud semántica con trigram flojo: ahora SÍ cruza el corte", () => {
    // El caso que a los trigramas se les escapa: léxicamente distinto,
    // semánticamente igual.
    const score = combineSimilarityScores({
      trigramSimilarity: 0.05,
      cosineSimilarity: 0.85,
      trigramThreshold,
    });
    expect(score).toBeGreaterThanOrEqual(COMBINED_SIMILARITY_THRESHOLD);
  });

  it("ni léxica ni semántica: queda por debajo del corte", () => {
    const score = combineSimilarityScores({
      trigramSimilarity: 0.08,
      cosineSimilarity: 0.6,
      trigramThreshold,
    });
    expect(score).toBeLessThan(COMBINED_SIMILARITY_THRESHOLD);
  });

  it("respeta un umbral de coseno explícito por sobre el default", () => {
    const base = {
      trigramSimilarity: 0.05,
      cosineSimilarity: 0.8,
      trigramThreshold,
    };
    // Con el default (0.78) 0.8 cruza; con un umbral más exigente (0.95) no.
    expect(combineSimilarityScores(base) >= COMBINED_SIMILARITY_THRESHOLD).toBe(
      true,
    );
    expect(
      combineSimilarityScores({ ...base, cosineThreshold: 0.95 }) <
        COMBINED_SIMILARITY_THRESHOLD,
    ).toBe(true);
  });

  it("el default de umbral de coseno es 0.78 y el corte combinado 0.5", () => {
    expect(DEFAULT_COSINE_SIMILARITY_THRESHOLD).toBe(0.78);
    expect(COMBINED_SIMILARITY_THRESHOLD).toBe(0.5);
  });
});
