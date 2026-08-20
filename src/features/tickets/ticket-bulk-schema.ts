import { z } from "zod";

import { ticketStatus } from "@/db/schema";

// Acciones masivas (paso 6.5) -- cambiar estado o asignar responsable a
// varios reclamos a la vez. Ver el reporte del paso para las decisiones
// completas; resumen acá, al lado del código que las aplica.

// Cómo se selecciona -- dos modos, nunca ambiguos entre sí (ver CLAUDE.md >
// Acciones masivas):
// - "ids": la selección manual (casillas por fila, tildadas a mano o vía
//   "seleccionar todo" DE ESTA PÁGINA). Nunca puede superar
//   TICKET_INBOX_PAGE_SIZE (25) en el uso normal -- la UI solo ofrece
//   casillas sobre los reclamos YA CARGADOS en esta página, sin acumular
//   selección entre páginas.
// - "filtered": "seleccionar los N reclamos que matchean estos filtros"
//   (la escalada explícita cuando hay más resultados que esta página) --
//   viaja como los MISMOS parámetros de filtro que ya vive en la URL de la
//   bandeja, nunca como una lista de ids armada en el cliente. El servidor
//   vuelve a resolver la lista real de ids EN EL MOMENTO de ejecutar (ver
//   getTicketIdsForFilters, queries.ts) -- nunca confía en una lista vieja
//   que el cliente pudiera mandar, y siempre opera sobre lo que el filtro
//   matchea DE VERDAD en ese instante, no en lo que matcheaba cuando se
//   tildó la casilla.
const bulkSelectionSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("ids"),
    ticketIds: z.array(z.uuid()).min(1).max(500),
  }),
  z.object({
    mode: z.literal("filtered"),
    // Los mismos searchParams crudos de la bandeja (building/unit/category/
    // status/priority/assignee/from/to/q) -- se revalidan del lado del
    // servidor con ticketInboxSearchParamsSchema, igual que hace page.tsx
    // con la URL real. Un registro de string sueltos, no algo más
    // estructurado: es exactamente lo que ya viaja en la URL, sin inventar
    // un segundo formato.
    filters: z.record(z.string(), z.string().optional()),
  }),
]);

export type BulkTicketSelection = z.infer<typeof bulkSelectionSchema>;

export const bulkChangeStatusInputSchema = z.object({
  selection: bulkSelectionSchema,
  toStatus: z.enum(ticketStatus.enumValues),
});

export const bulkAssignInputSchema = z.object({
  selection: bulkSelectionSchema,
  assignee: z
    .string()
    .trim()
    .max(100, "Como máximo 100 caracteres.")
    .nullable()
    .transform((value) => (value ? value : null)),
});

// Resultado uniforme para las dos acciones masivas -- "se hace lo que se
// puede", nunca todo o nada (ver CLAUDE.md > Acciones masivas para el
// razonamiento completo): `updatedCount` es lo que efectivamente cambió,
// `skippedCount` lo que no (transición inválida para el estado, o ya tenía
// ese mismo responsable), `notFoundCount` lo que ni siquiera correspondía
// a un reclamo real de esta organización (ids inventados, de otra
// organización, o ya dado de baja -- solo puede pasar en modo "ids" con un
// payload forjado a mano, nunca desde la UI real).
export type BulkActionResult =
  | {
      ok: true;
      updatedCount: number;
      skippedCount: number;
      notFoundCount: number;
    }
  | { ok: false; error: string };
