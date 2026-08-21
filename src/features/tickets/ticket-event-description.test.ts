import { describe, expect, it } from "vitest";

import { describeTicketEvent } from "./ticket-event-description";

describe("describeTicketEvent", () => {
  it("created por un vecino: reportó el reclamo", () => {
    const result = describeTicketEvent({
      type: "created",
      actorType: "neighbor",
      actorLabel: "Ana Gómez",
      payload: { source: "public_form" },
    });
    expect(result.headline).toBe("Ana Gómez reportó el reclamo");
    expect(result.detail).toBeNull();
  });

  it("created por administración: cargó el reclamo, no 'reportó'", () => {
    const result = describeTicketEvent({
      type: "created",
      actorType: "admin",
      actorLabel: "Administración",
      payload: {},
    });
    expect(result.headline).toBe("Administración cargó el reclamo");
  });

  it("created por el sistema: texto genérico sin actorLabel forzado", () => {
    const result = describeTicketEvent({
      type: "created",
      actorType: "system",
      actorLabel: "Sistema",
      payload: {},
    });
    expect(result.headline).toBe("El reclamo se creó automáticamente");
  });

  it("status_changed: traduce los valores del enum al mismo vocabulario que StatusBadge", () => {
    const result = describeTicketEvent({
      type: "status_changed",
      actorType: "admin",
      actorLabel: "Administración",
      payload: { from: "in_progress", to: "resolved" },
    });
    expect(result.headline).toBe(
      'Administración cambió el estado de "En progreso" a "Resuelto"',
    );
    expect(result.detail).toBeNull();
  });

  it("status_changed con from=new: usa 'Abierto', no 'Nuevo' -- mismo mapeo que status-mapping.ts", () => {
    const result = describeTicketEvent({
      type: "status_changed",
      actorType: "admin",
      actorLabel: "Administración",
      payload: { from: "new", to: "in_progress" },
    });
    expect(result.headline).toContain('"Abierto"');
  });

  it("status_changed con payload inválido: cae a un texto genérico, no rompe", () => {
    const result = describeTicketEvent({
      type: "status_changed",
      actorType: "admin",
      actorLabel: "Administración",
      payload: { algoRaro: true },
    });
    expect(result.headline).toBe("Administración cambió el estado del reclamo");
  });

  it("priority_changed: traduce los valores del enum al mismo vocabulario que PriorityBadge", () => {
    const result = describeTicketEvent({
      type: "priority_changed",
      actorType: "admin",
      actorLabel: "Administración",
      payload: { from: "medium", to: "urgent" },
    });
    expect(result.headline).toBe(
      'Administración cambió la prioridad de "Media" a "Urgente"',
    );
  });

  it("assigned con assignee: dice a quién", () => {
    const result = describeTicketEvent({
      type: "assigned",
      actorType: "admin",
      actorLabel: "Administración",
      payload: { assignee: "Plomero Hugo" },
    });
    expect(result.headline).toBe(
      "Administración asignó el reclamo a Plomero Hugo",
    );
  });

  it("assigned con assignee null: se lee como quitar la asignación, no como un asignado vacío", () => {
    const result = describeTicketEvent({
      type: "assigned",
      actorType: "admin",
      actorLabel: "Administración",
      payload: { assignee: null },
    });
    expect(result.headline).toBe(
      "Administración quitó la asignación del reclamo",
    );
  });

  it("note_added: el texto de la nota va en detail, no en el headline", () => {
    const result = describeTicketEvent({
      type: "note_added",
      actorType: "admin",
      actorLabel: "Administración",
      payload: { note: "El plomero pasó y detectó la cañería del 3B." },
    });
    expect(result.headline).toBe("Administración agregó una nota");
    expect(result.detail).toBe("El plomero pasó y detectó la cañería del 3B.");
  });

  it("whatsapp_handoff_opened: nunca da a entender que el mensaje se envió o llegó", () => {
    const result = describeTicketEvent({
      type: "whatsapp_handoff_opened",
      actorType: "neighbor",
      actorLabel: "Juan Pérez",
      payload: {},
    });
    expect(result.headline).toBe(
      "Juan Pérez abrió WhatsApp para avisar sobre este reclamo",
    );
    // El texto tiene que decir explícitamente que NO confirma envío ni
    // entrega -- ver CLAUDE.md > Evento de handoff, riesgo R8 del plan.
    expect(result.detail).toContain("no que el mensaje se haya enviado");
    expect(result.detail).toContain("ni que haya llegado");
    expect(result.headline).not.toMatch(/envió|avisó|notificó|informó/i);
  });

  it("similar_ticket_detected: nombra el código del candidato y el % de similitud", () => {
    const result = describeTicketEvent({
      type: "similar_ticket_detected",
      actorType: "system",
      actorLabel: "Sistema",
      payload: {
        candidateTicketId: "a1111111-1111-4111-8111-111111111111",
        candidatePublicCode: "TC-2026-0001",
        similarity: 0.3105,
      },
    });
    expect(result.headline).toBe("Posible duplicado detectado: TC-2026-0001");
    expect(result.detail).toBe("31% de similitud con este reclamo.");
  });

  it("similar_ticket_detected con payload inválido: cae a un texto genérico, no rompe", () => {
    const result = describeTicketEvent({
      type: "similar_ticket_detected",
      actorType: "system",
      actorLabel: "Sistema",
      payload: { algoRaro: true },
    });
    expect(result.headline).toBe("Se detectó un posible reclamo duplicado");
    expect(result.detail).toBeNull();
  });

  it("similar_ticket_grouped: nombra el código del otro ticket, texto distinto de merged_into_incident", () => {
    const result = describeTicketEvent({
      type: "similar_ticket_grouped",
      actorType: "admin",
      actorLabel: "Administración",
      payload: {
        otherTicketId: "a1111111-1111-4111-8111-111111111111",
        otherPublicCode: "TC-2026-0001",
      },
    });
    expect(result.headline).toBe(
      "Administración marcó este reclamo como posible duplicado de TC-2026-0001",
    );
    // No puede compartir la palabra "agrupó" con merged_into_incident --
    // este evento (paso 7.3) todavía no arma ningún problema en común de
    // verdad, eso es el paso 7.4.
    expect(result.headline).not.toContain("agrupó");
    expect(result.detail).toBeNull();
  });

  it("similar_ticket_discarded: nombra el código del otro ticket", () => {
    const result = describeTicketEvent({
      type: "similar_ticket_discarded",
      actorType: "admin",
      actorLabel: "Administración",
      payload: {
        otherTicketId: "a1111111-1111-4111-8111-111111111111",
        otherPublicCode: "TC-2026-0002",
      },
    });
    expect(result.headline).toBe(
      "Administración descartó a TC-2026-0002 como posible duplicado",
    );
    expect(result.detail).toBeNull();
  });

  it("similar_ticket_grouped/discarded con payload inválido: cae a un texto genérico, no rompe", () => {
    const grouped = describeTicketEvent({
      type: "similar_ticket_grouped",
      actorType: "admin",
      actorLabel: "Administración",
      payload: { algoRaro: true },
    });
    expect(grouped.headline).toBe(
      "Administración marcó este reclamo como posible duplicado",
    );
    const discarded = describeTicketEvent({
      type: "similar_ticket_discarded",
      actorType: "admin",
      actorLabel: "Administración",
      payload: { algoRaro: true },
    });
    expect(discarded.headline).toBe(
      "Administración descartó un posible duplicado",
    );
  });

  it("evento sin payload en absoluto (columna con su default {}): no rompe ningún tipo", () => {
    const types = [
      "created",
      "status_changed",
      "priority_changed",
      "assigned",
      "note_added",
      "attachment_added",
      "merged_into_incident",
      "whatsapp_handoff_opened",
      "similar_ticket_detected",
      "similar_ticket_grouped",
      "similar_ticket_discarded",
    ] as const;
    for (const type of types) {
      expect(() =>
        describeTicketEvent({
          type,
          actorType: "admin",
          actorLabel: "Administración",
          payload: {},
        }),
      ).not.toThrow();
    }
  });
});
