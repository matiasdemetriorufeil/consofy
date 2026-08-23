import { z } from "zod";

// Criterio de destinatarios de un aviso (paso 8.2) -- validado acá,
// compartido entre cliente (AnnouncementSegmentForm) y servidor (actions.ts),
// mismo patrón que building-schema.ts. Forma exacta documentada en el
// comentario de `announcements.segment` (src/db/schema/announcements.ts) --
// esta es la fuente de verdad de ESE shape, no una copia independiente.
//
// Todos los arrays con default [] -- "sin filtro en esta categoría", nunca
// undefined: así el objeto se puede persistir tal cual en la columna jsonb
// (que tiene su propio default `{}`) sin ramas especiales para "faltante"
// vs. "vacío".
export const segmentCriteriaSchema = z.object({
  towers: z.array(z.string()).default([]),
  floors: z.array(z.string()).default([]),
  roles: z.array(z.enum(["owner", "tenant"])).default([]),
  personIds: z.array(z.uuid()).default([]),
});

export type SegmentCriteria = z.infer<typeof segmentCriteriaSchema>;

export const EMPTY_SEGMENT_CRITERIA: SegmentCriteria = {
  towers: [],
  floors: [],
  roles: [],
  personIds: [],
};

// Input de countSegmentRecipientsAction -- buildingId viaja junto al
// criterio (no vive en segmentCriteriaSchema) porque towers/floors solo
// tienen sentido resueltos CONTRA un edificio puntual -- ver el
// comentario de announcements.buildingId.
export const countSegmentInputSchema = z.object({
  buildingId: z.uuid().nullable(),
  segment: segmentCriteriaSchema,
});

export type CountSegmentInput = z.input<typeof countSegmentInputSchema>;

export type SegmentRecipientCount = {
  // Personas que van a recibir el aviso: califican por el segmento Y
  // tienen teléfono cargado.
  qualifiedWithPhone: number;
  // Personas que califican por el segmento pero NO tienen teléfono
  // cargado -- excluidas del envío (conecta con el paso 8.7), pero
  // mostradas acá para que el administrador sepa que existen. Ver
  // CLAUDE.md > Acceso a datos: phone_e164 nullable a propósito.
  qualifiedWithoutPhone: number;
};

export const createAnnouncementDraftSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Ingresá un título.")
    .max(200, "Como máximo 200 caracteres."),
  body: z
    .string()
    .trim()
    .min(1, "Ingresá el texto del aviso.")
    .max(4000, "Como máximo 4000 caracteres."),
  buildingId: z.uuid().nullable(),
  segment: segmentCriteriaSchema,
});

export type CreateAnnouncementDraftInput = z.input<
  typeof createAnnouncementDraftSchema
>;

export type CreateAnnouncementDraftResult =
  { ok: true; id: string } | { ok: false; error: string };
