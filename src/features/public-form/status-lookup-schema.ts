import { z } from "zod";

import type { tickets } from "@/db/schema";

// Compartido cliente/servidor (TicketStatusLookupForm vía zodResolver + la
// Server Action `lookupTicketStatusAction`) -- mismo patrón que
// ticket-schema.ts. Archivo puro, sin `import "server-only"`: se testea con
// Vitest sin infraestructura de servidor.

type DbTicketStatus = (typeof tickets.$inferSelect)["status"];

// Vocabulario PÚBLICO del estado -- el que ve un vecino, distinto del panel
// (STATUS_LABEL en tickets/components/status-badge.tsx: "Abierto", "En
// progreso", "Descartado"). "Descartado" a secas suena a que no le dieron
// bola; para el vecino que reportó, "Cerrado sin resolución" es más honesto
// sin ser brusco. Los CINCO valores del enum real de la base, sin excepción
// -- si mañana se agrega un estado nuevo, TypeScript obliga a decidir su
// etiqueta pública acá.
export const PUBLIC_TICKET_STATUS_LABEL: Record<DbTicketStatus, string> = {
  new: "Recibido",
  in_progress: "En curso",
  resolved: "Resuelto",
  closed: "Cerrado",
  discarded: "Cerrado sin resolución",
};

// public_code tal como lo tipea el vecino: PREFIJO-AÑO-NNNN (ver la
// migración 0009 y el CHECK `buildings.code_prefix ~ '^[A-Z]{2,4}$'`). Se
// normaliza a mayúsculas y se recortan espacios; el match contra la base es
// EXACTO sobre ese formato -- el mismo que muestran la pantalla de
// confirmación y el mensaje de WhatsApp, así que copiar y pegar funciona.
// No se intenta "arreglar" separadores ni ceros faltantes: si no matchea,
// el resultado es el mismo "no encontramos" ambiguo, sin pistas.
export const PUBLIC_CODE_REGEX = /^[A-Z]{2,4}-\d{4}-\d{4}$/;

export const ticketStatusLookupSchema = z.object({
  token: z.uuid(),
  publicCode: z
    .string()
    .trim()
    .toUpperCase()
    .pipe(
      z
        .string()
        .regex(
          PUBLIC_CODE_REGEX,
          "Revisá el código: tiene que ser como TC-2026-0007.",
        ),
    ),
});

export type TicketStatusLookupInput = z.infer<typeof ticketStatusLookupSchema>;

// Lo MÍNIMO para confirmar "sí, este es tu reclamo" por la vía DÉBIL
// (public_code tipeado a mano, `/r/[token]/estado`): estado, edificio/
// unidad, categoría y fecha de reporte. SIN título, SIN descripción, SIN el
// nombre de quien lo reportó, SIN fotos, SIN asignado, SIN notas internas.
//
// Sin `title` a propósito: el título de un reclamo del formulario público
// se deriva de las primeras ~80 letras de la descripción libre que escribió
// el vecino (deriveTicketTitle, paso 5.5), así que mostrarlo por una vía
// cuyo código es corto y adivinable a propósito filtra texto libre de
// terceros. La categoría (abajo) cumple la misma función -- "¿es este mi
// reclamo?" -- y es un valor de enum fijo, nunca texto libre. La vía por
// link (`/s/[token]`, token no adivinable) SÍ muestra título y descripción:
// ahí ese riesgo no aplica.
export type PublicTicketStatus = {
  status: DbTicketStatus;
  buildingName: string;
  unitLabel: string;
  categoryName: string;
  reportedAt: Date;
  organizationTimezone: string;
};

export type TicketStatusLookupState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "found"; ticket: PublicTicketStatus };

export const initialTicketStatusLookupState: TicketStatusLookupState = {
  status: "idle",
};
