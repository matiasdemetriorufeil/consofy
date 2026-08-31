import { z } from "zod";

// Compartido cliente/servidor (ResidentUpdateForm + addResidentUpdateAction)
// y también lo lee el panel (describeTicketEvent) y la vista pública
// (buildPublicTimeline). Archivo puro (sin `server-only`): se testea con
// Vitest. Paso 11.4 -- el vecino agrega información o fotos a un reclamo
// abierto desde `/s/[token]`.

// Mismo tope que la descripción original del reclamo (publicTicketFormSchema
// en ticket-schema.ts).
export const MAX_RESIDENT_UPDATE_TEXT = 2000;

// El texto es OPCIONAL. Vacío / solo espacios -> `null` (se trata igual que
// "no mandó texto"). La regla "al menos uno de los dos" (texto o fotos) la
// aplica la Server Action, no este schema, porque las fotos no viajan por
// acá (van como File en un FormData).
export const residentUpdateTextSchema = z
  .string()
  .trim()
  .max(
    MAX_RESIDENT_UPDATE_TEXT,
    `Como máximo ${MAX_RESIDENT_UPDATE_TEXT} caracteres.`,
  )
  .optional()
  .transform((value) => (value ? value : null));

// Payload del evento `resident_update_added`. Se revalida del lado de
// LECTURA (panel y vista pública) antes de confiar en su forma -- mismo
// criterio que el resto de los payloads de `ticket_events` (ver
// ticket-event-description.ts).
export const residentUpdateAddedPayloadSchema = z.object({
  text: z.string().trim().min(1).nullable().optional(),
  photoCount: z.number().int().nonnegative().optional(),
});

// Estado de useActionState para ResidentUpdateForm. Vive ACÁ y no en
// actions.ts porque un archivo "use server" solo puede exportar funciones
// async (mismo motivo que CreateTicketState en ticket-schema.ts).
export type ResidentUpdateState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; message: string };

export const initialResidentUpdateState: ResidentUpdateState = {
  status: "idle",
};

// Frase corta "qué agregó el vecino" -- una sola redacción para el headline
// del panel y la línea de tiempo pública. Devuelve el sustantivo
// ("información", "2 fotos", "información y 2 fotos"); el que llama arma la
// oración alrededor.
export function summarizeResidentUpdate(
  text: string | null | undefined,
  photoCount: number,
): string {
  const hasText = typeof text === "string" && text.trim().length > 0;
  const photos =
    photoCount > 0 ? `${photoCount} foto${photoCount === 1 ? "" : "s"}` : null;

  if (hasText && photos) {
    return `información y ${photos}`;
  }
  if (photos) {
    return photos;
  }
  return "información";
}
