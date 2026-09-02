import { describe, expect, it } from "vitest";

import {
  type ResolvedSimilarityCandidateRow,
  summarizeResolvedCandidates,
} from "./similarity-evaluation-summary";

function row(
  resolution: "grouped" | "discarded",
  combinedScore: number,
  extra: Partial<ResolvedSimilarityCandidateRow> = {},
): ResolvedSimilarityCandidateRow {
  return {
    candidateId: Math.random().toString(36).slice(2),
    resolution,
    resolvedAt: new Date("2026-08-30T12:00:00Z"),
    combinedScore,
    trigramSimilarity: null,
    cosineSimilarity: null,
    newTicket: { publicCode: "TC-2026-0001", title: "a" },
    oldTicket: { publicCode: "TC-2026-0002", title: "b" },
    buildingName: "Torre Central",
    categoryName: "Ascensores",
    ...extra,
  };
}

describe("summarizeResolvedCandidates", () => {
  it("cuenta agrupadas y descartadas", () => {
    const s = summarizeResolvedCandidates([
      row("grouped", 0.9),
      row("grouped", 0.8),
      row("discarded", 0.55),
    ]);
    expect(s.total).toBe(3);
    expect(s.groupedCount).toBe(2);
    expect(s.discardedCount).toBe(1);
  });

  it("promedia el score combinado por grupo cuando hay al menos 2 filas", () => {
    const s = summarizeResolvedCandidates([
      row("grouped", 0.9),
      row("grouped", 0.7),
      row("discarded", 0.5),
      row("discarded", 0.6),
    ]);
    expect(s.avgCombinedGrouped).toBeCloseTo(0.8, 10);
    expect(s.avgCombinedDiscarded).toBeCloseTo(0.55, 10);
  });

  it("no promedia un grupo con menos de 2 filas (queda null)", () => {
    const s = summarizeResolvedCandidates([
      row("grouped", 0.9),
      row("grouped", 0.8),
      row("discarded", 0.55),
    ]);
    expect(s.avgCombinedGrouped).not.toBeNull();
    expect(s.avgCombinedDiscarded).toBeNull();
  });

  it("no arma buckets con menos de 6 filas totales", () => {
    const s = summarizeResolvedCandidates([
      row("grouped", 0.9),
      row("discarded", 0.55),
    ]);
    expect(s.buckets).toBeNull();
  });

  it("arma buckets y recorta los extremos vacíos", () => {
    const rows = [
      row("discarded", 0.52),
      row("discarded", 0.58),
      row("grouped", 0.63),
      row("grouped", 0.74),
      row("grouped", 0.88),
      row("grouped", 0.97),
    ];
    const s = summarizeResolvedCandidates(rows);
    expect(s.buckets).not.toBeNull();
    // No hay filas < 0.5, así que ese bucket no aparece.
    expect(s.buckets!.some((b) => b.lo === 0)).toBe(false);
    // El primer bucket con datos es 0.5–0.6 (2 descartadas).
    expect(s.buckets![0]).toMatchObject({
      lo: 0.5,
      grouped: 0,
      discarded: 2,
    });
    // El último es 0.9–1.0 (1 agrupada).
    const last = s.buckets!.at(-1)!;
    expect(last.label).toBe("0.9–1.0");
    expect(last).toMatchObject({ grouped: 1, discarded: 0 });
    // Cada fila cae en exactamente un bucket.
    const totalInBuckets = s.buckets!.reduce(
      (sum, b) => sum + b.grouped + b.discarded,
      0,
    );
    expect(totalInBuckets).toBe(rows.length);
  });

  it("el bucket final incluye el score 1.0 exacto", () => {
    const rows = [
      row("grouped", 1),
      row("grouped", 1),
      row("grouped", 0.95),
      row("discarded", 0.7),
      row("discarded", 0.72),
      row("grouped", 0.83),
    ];
    const s = summarizeResolvedCandidates(rows);
    const last = s.buckets!.at(-1)!;
    expect(last.label).toBe("0.9–1.0");
    expect(last.grouped).toBe(3); // los dos 1.0 + el 0.95
  });

  it("lista vacía: todo en cero, sin promedios ni buckets", () => {
    const s = summarizeResolvedCandidates([]);
    expect(s).toEqual({
      total: 0,
      groupedCount: 0,
      discardedCount: 0,
      avgCombinedGrouped: null,
      avgCombinedDiscarded: null,
      buckets: null,
    });
  });
});
