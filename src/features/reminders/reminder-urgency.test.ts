import { describe, expect, it } from "vitest";

import {
  daysBetween,
  describeReminderDueDate,
  getReminderUrgency,
} from "./reminder-urgency";

// Paso 9.2 -- semáforo de vencimientos. "today" siempre se pasa como
// parámetro (nunca `new Date()` adentro de la función bajo prueba): mismo
// criterio que `referenceReportedAt` en findSimilarTickets, para poder
// probar contra fechas fijas sin que el resultado dependa de cuándo corre
// el test.
describe("daysBetween", () => {
  it("da 0 para la misma fecha", () => {
    expect(daysBetween("2026-09-01", "2026-09-01")).toBe(0);
  });

  it("da positivo cuando la segunda fecha es posterior", () => {
    expect(daysBetween("2026-09-01", "2026-09-05")).toBe(4);
  });

  it("da negativo cuando la segunda fecha es anterior", () => {
    expect(daysBetween("2026-09-05", "2026-09-01")).toBe(-4);
  });

  it("cruza meses y años correctamente", () => {
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(3);
  });
});

describe("getReminderUrgency", () => {
  const today = "2026-09-10";

  it("'overdue' cuando due_date ya pasó, sin importar notice_days", () => {
    expect(getReminderUrgency("2026-09-09", 7, today)).toBe("overdue");
    expect(getReminderUrgency("2026-01-01", 30, today)).toBe("overdue");
  });

  it("'upcoming' cuando due_date es HOY (caso límite, diff=0)", () => {
    expect(getReminderUrgency("2026-09-10", 0, today)).toBe("upcoming");
    expect(getReminderUrgency("2026-09-10", 7, today)).toBe("upcoming");
  });

  it("'upcoming' cuando due_date cae dentro de notice_days (inclusive)", () => {
    // today + 7 días = 2026-09-17, notice_days = 7 -> justo en el borde.
    expect(getReminderUrgency("2026-09-17", 7, today)).toBe("upcoming");
  });

  it("'ok' apenas un día pasado el borde de notice_days", () => {
    expect(getReminderUrgency("2026-09-18", 7, today)).toBe("ok");
  });

  it("'ok' bien lejos en el futuro", () => {
    expect(getReminderUrgency("2027-01-01", 7, today)).toBe("ok");
  });

  it("umbral 'upcoming' se ajusta al notice_days de CADA recordatorio, no un número fijo", () => {
    // Misma due_date, distinto notice_days -- confirma que el umbral es por
    // fila, no una constante global.
    expect(getReminderUrgency("2026-09-15", 3, today)).toBe("ok");
    expect(getReminderUrgency("2026-09-15", 5, today)).toBe("upcoming");
  });
});

describe("describeReminderDueDate", () => {
  const today = "2026-09-10";

  it("un día vencido", () => {
    expect(describeReminderDueDate("2026-09-09", today)).toBe(
      "Venció hace 1 día",
    );
  });

  it("varios días vencido", () => {
    expect(describeReminderDueDate("2026-09-05", today)).toBe(
      "Venció hace 5 días",
    );
  });

  it("vence hoy", () => {
    expect(describeReminderDueDate("2026-09-10", today)).toBe("Vence hoy");
  });

  it("vence mañana", () => {
    expect(describeReminderDueDate("2026-09-11", today)).toBe("Vence mañana");
  });

  it("vence en varios días", () => {
    expect(describeReminderDueDate("2026-09-20", today)).toBe(
      "Vence en 10 días",
    );
  });
});
