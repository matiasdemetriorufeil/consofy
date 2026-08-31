import { describe, expect, it } from "vitest";

import {
  buildPublicTimeline,
  PUBLIC_TIMELINE_EVENT_TYPES,
  type PublicTimelineEventRow,
} from "./public-timeline";

const REPORTED_AT = new Date("2026-02-01T10:00:00Z");

function ev(
  type: string,
  payload: unknown,
  minutesAfter: number,
): PublicTimelineEventRow {
  return {
    type: type as PublicTimelineEventRow["type"],
    payload,
    createdAt: new Date(REPORTED_AT.getTime() + minutesAfter * 60_000),
  };
}

describe("PUBLIC_TIMELINE_EVENT_TYPES (paso 11.2)", () => {
  it("es exactamente cambios de estado -- nada de notas/asignación/duplicados", () => {
    expect([...PUBLIC_TIMELINE_EVENT_TYPES].sort()).toEqual([
      "resolved_by_incident",
      "status_changed",
    ]);
  });
});

describe("buildPublicTimeline", () => {
  it("un reclamo recién creado sin eventos igual muestra la creación", () => {
    const t = buildPublicTimeline(REPORTED_AT, []);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({
      text: "Recibimos tu reclamo",
      at: REPORTED_AT,
    });
  });

  it("traduce status_changed al vocabulario del vecino, sin tecnicismos", () => {
    const t = buildPublicTimeline(REPORTED_AT, [
      ev("status_changed", { from: "new", to: "in_progress" }, 30),
    ]);
    expect(t).toHaveLength(2);
    expect(t[1]!.text).toBe("Tu reclamo pasó a «En curso»");
    // nunca el valor crudo del enum
    expect(t[1]!.text).not.toContain("in_progress");
  });

  it("resolved_by_incident se muestra como 'pasó a Resuelto', SIN nombrar el incidente", () => {
    const t = buildPublicTimeline(REPORTED_AT, [
      ev(
        "resolved_by_incident",
        {
          incidentId: "11111111-1111-4111-8111-111111111111",
          incidentTitle: "Filtración en columna 4 (deptos 3B, 4B, 5B)",
          fromStatus: "in_progress",
        },
        120,
      ),
    ]);
    expect(t[1]!.text).toBe("Tu reclamo pasó a «Resuelto»");
    expect(t[1]!.text).not.toContain("columna 4");
    expect(t[1]!.text).not.toContain("11111111");
  });

  it("ignora cualquier tipo interno que se cuele (defensa en profundidad)", () => {
    const t = buildPublicTimeline(REPORTED_AT, [
      ev("note_added", { note: "el plomero pasó por el 3B" }, 10),
      ev("assigned", { assignee: "Plomero Hugo" }, 20),
      ev("priority_changed", { from: "medium", to: "high" }, 25),
      ev("similar_ticket_detected", { candidatePublicCode: "EC-2026-0009" }, 5),
      ev("status_changed", { from: "new", to: "resolved" }, 40),
    ]);
    expect(t.map((e) => e.text)).toEqual([
      "Recibimos tu reclamo",
      "Tu reclamo pasó a «Resuelto»",
    ]);
  });

  it("un payload de status_changed roto no rompe la línea de tiempo", () => {
    const t = buildPublicTimeline(REPORTED_AT, [
      ev("status_changed", { to: "no-es-un-estado" }, 15),
    ]);
    expect(t[1]!.text).toBe("El estado de tu reclamo cambió");
  });

  it("ordena los eventos cronológicamente y deja la creación primero", () => {
    const t = buildPublicTimeline(REPORTED_AT, [
      ev("status_changed", { from: "in_progress", to: "resolved" }, 90),
      ev("status_changed", { from: "new", to: "in_progress" }, 30),
    ]);
    expect(t.map((e) => e.text)).toEqual([
      "Recibimos tu reclamo",
      "Tu reclamo pasó a «En curso»",
      "Tu reclamo pasó a «Resuelto»",
    ]);
    expect(t.map((e) => e.key)).toHaveLength(new Set(t.map((e) => e.key)).size);
  });
});
