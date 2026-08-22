import { describe, expect, it } from "vitest";

import { deriveAffectedParties } from "./derive-affected-parties";

describe("deriveAffectedParties", () => {
  it("dedupea unidades y vecinos que se repiten en más de un ticket del mismo incidente", () => {
    const result = deriveAffectedParties([
      { unitLabel: "A - 3°B", neighborId: "p1", neighborName: "Ana Gómez" },
      { unitLabel: "A - 3°B", neighborId: "p1", neighborName: "Ana Gómez" },
      { unitLabel: "A - 4°C", neighborId: "p2", neighborName: "Juan Pérez" },
    ]);
    expect(result.units).toEqual([{ label: "A - 3°B" }, { label: "A - 4°C" }]);
    expect(result.neighbors).toEqual([
      { id: "p1", name: "Ana Gómez" },
      { id: "p2", name: "Juan Pérez" },
    ]);
  });

  it("misma unidad, vecinos distintos: la unidad se dedupea, los dos vecinos quedan", () => {
    const result = deriveAffectedParties([
      { unitLabel: "A - 3°B", neighborId: "p1", neighborName: "Ana Gómez" },
      { unitLabel: "A - 3°B", neighborId: "p2", neighborName: "Otro Vecino" },
    ]);
    expect(result.units).toEqual([{ label: "A - 3°B" }]);
    expect(result.neighbors).toEqual([
      { id: "p1", name: "Ana Gómez" },
      { id: "p2", name: "Otro Vecino" },
    ]);
  });

  it("ticket sin vecino (personId null) no agrega un vecino vacío", () => {
    const result = deriveAffectedParties([
      { unitLabel: "A - 3°B", neighborId: null, neighborName: null },
    ]);
    expect(result.units).toEqual([{ label: "A - 3°B" }]);
    expect(result.neighbors).toEqual([]);
  });

  it("ticket sin unidad (unitLabel null) no agrega una unidad vacía", () => {
    const result = deriveAffectedParties([
      { unitLabel: null, neighborId: "p1", neighborName: "Ana Gómez" },
    ]);
    expect(result.units).toEqual([]);
    expect(result.neighbors).toEqual([{ id: "p1", name: "Ana Gómez" }]);
  });

  it("lista vacía de tickets: sin romper, sin resultados", () => {
    expect(deriveAffectedParties([])).toEqual({ units: [], neighbors: [] });
  });

  it("preserva el orden de primera aparición", () => {
    const result = deriveAffectedParties([
      { unitLabel: "B - 1°A", neighborId: "p2", neighborName: "Segundo" },
      { unitLabel: "A - 3°B", neighborId: "p1", neighborName: "Primero" },
    ]);
    expect(result.units.map((u) => u.label)).toEqual(["B - 1°A", "A - 3°B"]);
    expect(result.neighbors.map((n) => n.name)).toEqual(["Segundo", "Primero"]);
  });
});
