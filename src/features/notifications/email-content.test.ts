import { describe, expect, it } from "vitest";

import {
  buildDailySummaryEmail,
  buildUrgentTicketAlertEmail,
} from "./email-content";

describe("buildUrgentTicketAlertEmail", () => {
  it("arma subject y html con los datos del reclamo", () => {
    const result = buildUrgentTicketAlertEmail({
      buildingName: "Torre Central",
      ticketTitle: "Pérdida de agua en el subsuelo",
      ticketPublicCode: "TC-2026-0042",
      ticketUrl: "https://consofy.com.ar/panel/tickets/abc-123",
    });

    expect(result.subject).toBe("Reclamo urgente en Torre Central");
    expect(result.html).toContain("Torre Central");
    expect(result.html).toContain("TC-2026-0042");
    expect(result.html).toContain("Pérdida de agua en el subsuelo");
    expect(result.html).toContain(
      "https://consofy.com.ar/panel/tickets/abc-123",
    );
  });
});

describe("buildDailySummaryEmail", () => {
  it("arma subject exacto con organización y fecha", () => {
    const result = buildDailySummaryEmail({
      organizationName: "Rivadavia Administraciones",
      dateLabel: "27 de agosto de 2026",
      appUrl: "https://consofy.com.ar",
      newTickets: [],
      urgentUnresolvedTickets: [],
      remindersNeedingAttention: [],
    });

    expect(result.subject).toBe(
      "Resumen diario de Rivadavia Administraciones -- 27 de agosto de 2026",
    );
  });

  it("muestra 'Sin novedades' cuando las tres listas están vacías", () => {
    const result = buildDailySummaryEmail({
      organizationName: "Rivadavia Administraciones",
      dateLabel: "27 de agosto de 2026",
      appUrl: "https://consofy.com.ar",
      newTickets: [],
      urgentUnresolvedTickets: [],
      remindersNeedingAttention: [],
    });

    expect(result.html).toContain("Sin novedades para hoy.");
    expect(result.html).toContain("Reclamos nuevos hoy (0)");
    expect(result.html).toContain("Reclamos urgentes sin resolver (0)");
    expect(result.html).toContain("Recordatorios que necesitan atención (0)");
  });

  it("no muestra 'Sin novedades' si hay al menos un ítem en alguna lista", () => {
    const result = buildDailySummaryEmail({
      organizationName: "Rivadavia Administraciones",
      dateLabel: "27 de agosto de 2026",
      appUrl: "https://consofy.com.ar",
      newTickets: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          title: "Pérdida de agua",
          buildingName: "Torre Central",
          publicCode: "TC-2026-0042",
        },
      ],
      urgentUnresolvedTickets: [],
      remindersNeedingAttention: [],
    });

    expect(result.html).not.toContain("Sin novedades para hoy.");
  });

  it("lista los reclamos nuevos con código, título, edificio y link", () => {
    const result = buildDailySummaryEmail({
      organizationName: "Rivadavia Administraciones",
      dateLabel: "27 de agosto de 2026",
      appUrl: "https://consofy.com.ar",
      newTickets: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          title: "Pérdida de agua",
          buildingName: "Torre Central",
          publicCode: "TC-2026-0042",
        },
      ],
      urgentUnresolvedTickets: [],
      remindersNeedingAttention: [],
    });

    expect(result.html).toContain("TC-2026-0042");
    expect(result.html).toContain("Pérdida de agua");
    expect(result.html).toContain("Torre Central");
    expect(result.html).toContain(
      "https://consofy.com.ar/panel/tickets/11111111-1111-1111-1111-111111111111",
    );
    expect(result.html).toContain("Reclamos nuevos hoy (1)");
  });

  it("lista los reclamos urgentes sin resolver por separado de los nuevos", () => {
    const result = buildDailySummaryEmail({
      organizationName: "Rivadavia Administraciones",
      dateLabel: "27 de agosto de 2026",
      appUrl: "https://consofy.com.ar",
      newTickets: [],
      urgentUnresolvedTickets: [
        {
          id: "22222222-2222-2222-2222-222222222222",
          title: "Ascensor sin funcionar",
          buildingName: "Los Álamos",
          publicCode: "LA-2026-0007",
        },
      ],
      remindersNeedingAttention: [],
    });

    expect(result.html).toContain("Reclamos urgentes sin resolver (1)");
    expect(result.html).toContain("LA-2026-0007");
    expect(result.html).toContain("Ascensor sin funcionar");
  });

  it("distingue recordatorios vencidos de próximos a vencer", () => {
    const result = buildDailySummaryEmail({
      organizationName: "Rivadavia Administraciones",
      dateLabel: "27 de agosto de 2026",
      appUrl: "https://consofy.com.ar",
      newTickets: [],
      urgentUnresolvedTickets: [],
      remindersNeedingAttention: [
        {
          id: "33333333-3333-3333-3333-333333333333",
          title: "Service del ascensor",
          buildingName: "Torre Central",
          urgency: "overdue",
        },
        {
          id: "44444444-4444-4444-4444-444444444444",
          title: "Fumigación",
          buildingName: "Los Álamos",
          urgency: "upcoming",
        },
      ],
    });

    expect(result.html).toContain("Recordatorios que necesitan atención (2)");
    expect(result.html).toContain("[Vencido]");
    expect(result.html).toContain("Service del ascensor");
    expect(result.html).toContain("[Próximo]");
    expect(result.html).toContain("Fumigación");
  });
});
