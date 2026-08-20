import { describe, expect, it } from "vitest";

import {
  getTicketStatusActions,
  isValidStatusTransition,
  TICKET_STATUS_TRANSITIONS,
  type TicketStatusValue,
} from "./ticket-actions-schema";

const ALL_STATUSES: TicketStatusValue[] = [
  "new",
  "in_progress",
  "resolved",
  "closed",
  "discarded",
];

describe("isValidStatusTransition", () => {
  it("permite las transiciones hacia adelante esperadas", () => {
    expect(isValidStatusTransition("new", "in_progress")).toBe(true);
    expect(isValidStatusTransition("new", "resolved")).toBe(true);
    expect(isValidStatusTransition("new", "discarded")).toBe(true);
    expect(isValidStatusTransition("in_progress", "resolved")).toBe(true);
    expect(isValidStatusTransition("in_progress", "discarded")).toBe(true);
    expect(isValidStatusTransition("resolved", "closed")).toBe(true);
  });

  it("permite reabrir resuelto/cerrado hacia en progreso, y descartado hacia nuevo", () => {
    expect(isValidStatusTransition("resolved", "in_progress")).toBe(true);
    expect(isValidStatusTransition("closed", "in_progress")).toBe(true);
    expect(isValidStatusTransition("discarded", "new")).toBe(true);
  });

  it("bloquea new -> closed directo (ya existe discarded para 'no aplica')", () => {
    expect(isValidStatusTransition("new", "closed")).toBe(false);
  });

  it("bloquea in_progress -> new (nadie desempieza un trabajo ya arrancado)", () => {
    expect(isValidStatusTransition("in_progress", "new")).toBe(false);
  });

  it("bloquea resolved/closed -> discarded (no se descarta algo ya arreglado)", () => {
    expect(isValidStatusTransition("resolved", "discarded")).toBe(false);
    expect(isValidStatusTransition("closed", "discarded")).toBe(false);
  });

  it("bloquea closed -> resolved (closed siempre viene DESPUÉS de resolved, nunca al revés)", () => {
    expect(isValidStatusTransition("closed", "resolved")).toBe(false);
  });

  it("bloquea discarded -> in_progress/resolved/closed directo (tiene que reabrir a 'new' primero)", () => {
    expect(isValidStatusTransition("discarded", "in_progress")).toBe(false);
    expect(isValidStatusTransition("discarded", "resolved")).toBe(false);
    expect(isValidStatusTransition("discarded", "closed")).toBe(false);
  });

  it("bloquea cualquier estado hacia sí mismo (no es una transición real)", () => {
    for (const status of ALL_STATUSES) {
      expect(isValidStatusTransition(status, status)).toBe(false);
    }
  });

  it("el mapa de transiciones no tiene ningún destino repetido ni un estado inexistente", () => {
    for (const status of ALL_STATUSES) {
      const targets = TICKET_STATUS_TRANSITIONS[status];
      expect(new Set(targets).size).toBe(targets.length);
      for (const target of targets) {
        expect(ALL_STATUSES).toContain(target);
      }
    }
  });
});

describe("getTicketStatusActions", () => {
  it("new: en progreso, resuelto o descartar -- nunca 'cerrado' directo", () => {
    const actions = getTicketStatusActions("new");
    expect(actions.map((a) => a.targetStatus).sort()).toEqual(
      ["discarded", "in_progress", "resolved"].sort(),
    );
    expect(actions.find((a) => a.targetStatus === "in_progress")?.label).toBe(
      "Marcar en progreso",
    );
  });

  it("resolved: reabrir (a in_progress) o cerrar -- el botón dice 'Reabrir', no el nombre del estado", () => {
    const actions = getTicketStatusActions("resolved");
    const reopen = actions.find((a) => a.targetStatus === "in_progress");
    const close = actions.find((a) => a.targetStatus === "closed");
    expect(reopen?.label).toBe("Reabrir");
    expect(close?.label).toBe("Cerrar");
  });

  it("closed: solo reabrir", () => {
    const actions = getTicketStatusActions("closed");
    expect(actions).toEqual([
      { targetStatus: "in_progress", label: "Reabrir" },
    ]);
  });

  it("discarded: solo reabrir (hacia 'new', nunca directo a 'in_progress')", () => {
    const actions = getTicketStatusActions("discarded");
    expect(actions).toEqual([{ targetStatus: "new", label: "Reabrir" }]);
  });
});
