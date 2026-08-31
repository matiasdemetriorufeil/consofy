import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { PublicTicketStatus } from "../status-lookup-schema";
import { TicketStatusSummary } from "./ticket-status-summary";

// La vía b del paso 11.1 (public_code tipeado a mano) NO muestra el título:
// se deriva de la descripción libre del vecino y el código es adivinable a
// propósito. Debe mostrar la categoría (enum fijo) en su lugar.
const base: PublicTicketStatus = {
  status: "in_progress",
  buildingName: "Edificio Cabildo",
  unitLabel: "3°B",
  categoryName: "Ascensores",
  reportedAt: new Date("2026-02-01T12:00:00Z"),
  organizationTimezone: "America/Argentina/Cordoba",
};

describe("TicketStatusSummary (vía b, paso 11.1)", () => {
  it("muestra estado, categoría, edificio/unidad y fecha", () => {
    const html = renderToStaticMarkup(<TicketStatusSummary ticket={base} />);
    expect(html).toContain("En curso"); // etiqueta pública de in_progress
    expect(html).toContain("Categoría");
    expect(html).toContain("Ascensores");
    expect(html).toContain("Edificio Cabildo");
    expect(html).toContain("3°B");
  });

  it("NO muestra un rótulo de título/reclamo ni texto libre de la descripción", () => {
    const html = renderToStaticMarkup(<TicketStatusSummary ticket={base} />);
    // El rótulo "Reclamo" (que acompañaba al título derivado) ya no está.
    expect(html).not.toContain("Reclamo");
    // Y el tipo ya no admite pasar un título: esto no compilaría con `title`.
    const withStrayText = {
      ...base,
      categoryName: "Plomería",
    } satisfies PublicTicketStatus;
    const html2 = renderToStaticMarkup(
      <TicketStatusSummary ticket={withStrayText} />,
    );
    expect(html2).toContain("Plomería");
    expect(html2).not.toContain("goteo en la cocina del 4to piso"); // descripción libre de ejemplo, nunca llega acá
  });
});
