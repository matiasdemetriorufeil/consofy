import { z } from "zod";

import {
  SIMILARITY_THRESHOLD_MAX,
  SIMILARITY_THRESHOLD_MIN_EXCLUSIVE,
  SIMILARITY_WINDOW_HOURS_MAX,
  SIMILARITY_WINDOW_HOURS_MIN,
} from "@/features/tickets/similarity-config";

// Paso 7.6 -- validación compartida cliente/servidor (mismo patrón que
// building-schema.ts), para el formulario de configuración de la
// detección de posibles duplicados. Los límites (1-720 horas, umbral en
// (0, 1]) son los MISMOS que el CHECK de buildings.ts -- ver el
// comentario de esas constantes en similarity-config.ts para el criterio
// completo de cada extremo.
//
// z.number(), no z.coerce.number() -- mismo motivo ya documentado en
// unit-schema.ts (bulkUnitsFormSchema): un input coercido tipa como
// `unknown` en Zod 4, lo que rompe el tipado de react-hook-form
// (register()/defaultValues). El <input type="number"> del formulario ya
// entrega un `number` real vía la opción `valueAsNumber` de RHF, así que
// acá alcanza con validar el rango, sin coercionar nada.
export const updateSimilaritySettingsSchema = z.object({
  buildingId: z.uuid(),
  windowHours: z
    .number({ message: "Ingresá un número." })
    .int("Tiene que ser un número entero.")
    .min(
      SIMILARITY_WINDOW_HOURS_MIN,
      `Como mínimo ${SIMILARITY_WINDOW_HOURS_MIN} hora.`,
    )
    .max(
      SIMILARITY_WINDOW_HOURS_MAX,
      `Como máximo ${SIMILARITY_WINDOW_HOURS_MAX} horas (30 días).`,
    ),
  threshold: z
    .number({ message: "Ingresá un número." })
    .gt(
      SIMILARITY_THRESHOLD_MIN_EXCLUSIVE,
      "Tiene que ser mayor a 0 -- un umbral de 0 marcaría cualquier reclamo como posible duplicado.",
    )
    .max(SIMILARITY_THRESHOLD_MAX, "Como máximo 1."),
});

export type UpdateSimilaritySettingsInput = z.input<
  typeof updateSimilaritySettingsSchema
>;

export type UpdateSimilaritySettingsResult =
  { ok: true } | { ok: false; error: string };
