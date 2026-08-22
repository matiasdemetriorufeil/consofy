export type IncidentTicketForDedup = {
  unitLabel: string | null;
  neighborId: string | null;
  neighborName: string | null;
};

export type AffectedUnit = {
  label: string;
};

export type AffectedNeighbor = {
  id: string;
  name: string;
};

export type AffectedParties = {
  units: AffectedUnit[];
  neighbors: AffectedNeighbor[];
};

// Unidades y vecinos afectados por un incidente (paso 7.4) -- pura, sin
// tocar la base, para poder testearla en aislamiento (mismo criterio que
// normalize-ticket-text.ts, paso 7.1). Dedupe por CLAVE real, no por
// texto: dos tickets del mismo incidente pueden compartir la misma unidad
// (mismo `unitLabel`) o el mismo vecino (mismo `neighborId`) -- listarlos
// dos veces mostraría "la misma persona afectada" como si fueran dos
// vecinos distintos. Preserva el orden de primera aparición (los tickets
// ya llegan ordenados por reportedAt, ver getIncidentTickets).
export function deriveAffectedParties(
  tickets: IncidentTicketForDedup[],
): AffectedParties {
  const seenUnitLabels = new Set<string>();
  const units: AffectedUnit[] = [];
  const seenNeighborIds = new Set<string>();
  const neighbors: AffectedNeighbor[] = [];

  for (const ticket of tickets) {
    if (ticket.unitLabel && !seenUnitLabels.has(ticket.unitLabel)) {
      seenUnitLabels.add(ticket.unitLabel);
      units.push({ label: ticket.unitLabel });
    }
    if (
      ticket.neighborId &&
      ticket.neighborName &&
      !seenNeighborIds.has(ticket.neighborId)
    ) {
      seenNeighborIds.add(ticket.neighborId);
      neighbors.push({ id: ticket.neighborId, name: ticket.neighborName });
    }
  }

  return { units, neighbors };
}
