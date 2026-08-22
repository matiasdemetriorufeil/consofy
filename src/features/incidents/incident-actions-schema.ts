import { z } from "zod";

// Paso 7.5 -- input/resultado de resolveIncidentAction (incidents/
// actions.ts). Archivo separado sin "use server" (mismo criterio que
// tickets/ticket-actions-schema.ts): un archivo "use server" solo puede
// exportar funciones async, así que el schema de Zod y el tipo de
// resultado viven acá.
export const resolveIncidentInputSchema = z.object({
  incidentId: z.uuid(),
});

export type ResolveIncidentResult =
  | { ok: true; resolvedCount: number; skippedCount: number }
  | { ok: false; error: string };
