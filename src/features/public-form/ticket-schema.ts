import { z } from "zod";

import {
  AR_WHATSAPP_E164_REGEX,
  AR_WHATSAPP_HELP,
  normalizePhoneInput,
} from "@/lib/phone";
import { personFieldsSchema } from "@/features/people/person-schema";
import type { TicketMessagePriority } from "@/features/tickets/format-ticket-message";

// Compartido entre cliente (TicketForm, vía zodResolver) y lo que va a ser
// el servidor en el paso 5.5 -- mismo patrón que unit-schema.ts/
// person-schema.ts (ver CLAUDE.md > Reglas de seguridad). Cubre los datos
// REALES de un reclamo (identificación + problema); las fotos del paso 3
// tienen su propia validación más abajo, separada a propósito -- ver el
// comentario de esa sección.

export const PUBLIC_TICKET_STEPS = [
  { id: 1, title: "Tus datos" },
  { id: 2, title: "El problema" },
  { id: 3, title: "Fotos" },
  { id: 4, title: "Revisá y enviá" },
] as const;
export const TOTAL_STEPS = PUBLIC_TICKET_STEPS.length;

// A diferencia de people.phoneE164 (nullable -- el administrador puede
// cargar a alguien de quien todavía no tiene el teléfono), acá es
// OBLIGATORIO: el formulario público es justo el flujo donde, según
// CLAUDE.md > Acceso a datos, el teléfono "SIEMPRE" se pide. Reusa el mismo
// formato/regex/normalización que ya usa people (AR_WHATSAPP_*, src/lib/
// phone.ts), no una validación nueva.
const requiredPhoneSchema = z
  .string()
  .trim()
  .min(1, "Dejanos un teléfono de contacto.")
  .transform(normalizePhoneInput)
  .pipe(z.string().regex(AR_WHATSAPP_E164_REGEX, AR_WHATSAPP_HELP));

// firstName/lastName: mismas reglas que people (personFieldsSchema), sin
// reescribirlas -- reuso directo con pick(), mismo criterio que "extraer
// recién con el segundo consumidor real" ya aplicado a AR_WHATSAPP_*.
const identificationFields = personFieldsSchema
  .pick({ firstName: true, lastName: true })
  .extend({
    phoneE164: requiredPhoneSchema,
    // Unidad: dos formas mutuamente excluyentes de identificarla, reflejo
    // exacto del CHECK de tickets ("unit_id o unit_label_raw", ver
    // src/db/schema/tickets.ts) -- unitNotListed es el toggle que el
    // vecino usa cuando no encuentra su unidad en la lista (paso 5.3 es el
    // selector "de verdad"; acá alcanza con una lista simple + esta
    // salida).
    unitNotListed: z.boolean(),
    unitId: z
      .uuid()
      .nullish()
      .transform((value) => value ?? null),
    unitLabelRaw: z
      .string()
      .trim()
      .max(60, "Como máximo 60 caracteres.")
      .nullish()
      .transform((value) => (value ? value : null)),
  });

// Categoría y descripción. SIN prioridad -- decisión de producto explicada
// en el reporte del paso 5.2: dejarla en manos del vecino no aporta señal
// real (todo el mundo marca "urgente"), así que la prioridad real del
// reclamo sale de categories.default_priority al crearlo (paso 5.5), no de
// un campo acá.
const problemFields = z.object({
  categoryId: z.uuid({ message: "Elegí una categoría." }),
  description: z
    .string()
    .trim()
    .min(10, "Contanos un poco más -- al menos 10 caracteres.")
    .max(2000, "Como máximo 2000 caracteres."),
});

export const publicTicketFormSchema = identificationFields
  .extend(problemFields.shape)
  .refine((data) => data.unitNotListed || !!data.unitId, {
    message: "Elegí tu unidad de la lista.",
    path: ["unitId"],
  })
  .refine((data) => !data.unitNotListed || !!data.unitLabelRaw, {
    message: "Contanos dónde vivís (piso y depto, o una referencia).",
    path: ["unitLabelRaw"],
  });

export type PublicTicketFormInput = z.input<typeof publicTicketFormSchema>;
export type PublicTicketFormOutput = z.output<typeof publicTicketFormSchema>;

// Qué campos valida cada paso al apretar "Continuar" -- ver TicketForm.
// trigger(names) de react-hook-form igual corre el resolver completo por
// dentro (un solo schema, no uno por paso), pero solo marca/expone errores
// de los campos pedidos, así que un error del paso 2 nunca aparece
// mientras el vecino todavía está en el paso 1.
export const IDENTIFICATION_STEP_FIELDS = [
  "firstName",
  "lastName",
  "phoneE164",
  "unitNotListed",
  "unitId",
  "unitLabelRaw",
] as const satisfies readonly (keyof PublicTicketFormInput)[];

export const PROBLEM_STEP_FIELDS = [
  "categoryId",
  "description",
] as const satisfies readonly (keyof PublicTicketFormInput)[];

// -----------------------------------------------------------------------
// Fotos y adjuntos (paso 5.2 definió la estructura mínima; paso 5.4 la
// completa con subida real a Supabase Storage -- ver
// src/features/public-form/upload-attachment.ts y compress-image.ts)
// -----------------------------------------------------------------------
// No forman parte de publicTicketFormSchema: lo que viaja por ese schema
// son los datos REALES del reclamo (texto), mientras que un adjunto ya
// subido se identifica por su storage_path (un string, pero con un ciclo
// de vida propio -- subir, poder fallar, poder reintentarse -- que no
// encaja en la validación de un formulario de texto plano).
export const MAX_TICKET_PHOTOS = 5;
export const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;

// Nombre del bucket creado en la migración 0019 -- una sola constante para
// no repetir el string en el módulo de subida, el de borrado y cualquier
// lectura futura (etapa del panel que muestre estos adjuntos).
export const TICKET_ATTACHMENTS_BUCKET = "ticket-attachments";

// Fotos (se comprimen y reencodan siempre a JPEG antes de subir, ver
// compress-image.ts) o PDF (pasan tal cual, sin comprimir -- ver el
// criterio completo en el reporte del paso 5.4: "¿sirve de algo permitir
// PDF si un vecino en un pasillo saca fotos?" -- sí, pero es el caso raro,
// no el que se optimiza).
export const ACCEPTED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];
export const ACCEPTED_DOCUMENT_MIME_TYPES = ["application/pdf"];
export const ACCEPTED_ATTACHMENT_MIME_TYPES = [
  ...ACCEPTED_IMAGE_MIME_TYPES,
  ...ACCEPTED_DOCUMENT_MIME_TYPES,
];

export function isAcceptedImageFile(file: File): boolean {
  return (ACCEPTED_IMAGE_MIME_TYPES as readonly string[]).includes(file.type);
}

export function isAcceptedDocumentFile(file: File): boolean {
  return (ACCEPTED_DOCUMENT_MIME_TYPES as readonly string[]).includes(
    file.type,
  );
}

// Solo tipo, NO tamaño -- a propósito. Los 5 MB del enunciado son el tope
// del archivo que efectivamente sube, no el que el vecino selecciona: una
// foto de celular real pesa "entre 3 y 8 MB" (dato del propio enunciado),
// así que rechazarla acá, ANTES de comprimir, tiraría abajo la mayoría de
// las fotos reales -- exactamente lo que la compresión existe para evitar.
// El tamaño se valida DESPUÉS: para un PDF (que no se comprime) es
// inmediato, para una foto es sobre el resultado ya comprimido -- ver
// validateAttachmentSize() y upload-attachment.ts.
export function validateAttachmentType(file: File): string | null {
  if (!isAcceptedImageFile(file) && !isAcceptedDocumentFile(file)) {
    return "Ese archivo tiene que ser una foto o un PDF.";
  }
  return null;
}

export function validateAttachmentSize(sizeBytes: number): string | null {
  if (sizeBytes > MAX_PHOTO_SIZE_BYTES) {
    return "Ese archivo pesa demasiado (máximo 5 MB), incluso después de comprimirlo.";
  }
  return null;
}

// -----------------------------------------------------------------------
// Confirmación del reclamo (paso 5.5)
// -----------------------------------------------------------------------
// Lo que createTicketAction recibe del cliente: los mismos datos REALES de
// publicTicketFormSchema (identificación + problema, con sus mismos
// refine()) MÁS lo que hace falta para ubicar el reclamo y sus adjuntos --
// `token` (para resolver el edificio/organización del lado del servidor,
// nunca confiando en nada que el cliente diga sobre a qué organización
// pertenece), `formSessionId` (para acotar qué archivos de `pending/` puede
// reclamar esta confirmación puntual, ver el análisis de seguridad del
// reporte) y la lista de adjuntos ya subidos en el paso 3/4.
//
// `.and()`, no `.extend()`: publicTicketFormSchema ya es un schema con
// refine() encadenados (no un ZodObject plano), así que no tiene
// `.extend()` -- `.and()` arma una intersección, que sigue validando los
// dos refine() originales Y los campos nuevos, sin reescribir nada.
// Honeypot (paso 5.11): campo que ningún vecino real ve ni completa (el
// input queda oculto fuera de pantalla en TicketForm, con autoComplete="off"
// y un nombre poco común para no atraer autocompletado de navegador/gestor
// de contraseñas), pero que un bot que llena todo a ciegas sí. Validado
// ACÁ, en el schema -- no solo con CSS del lado del cliente: createTicketAction
// es invocable por POST directo sin pasar por ningún componente (ver
// CLAUDE.md > Autorización de rutas y Server Actions), así que esconder el
// campo en el navegador no alcanza como defensa por sí sola. `.optional()`
// porque un caller legítimo (o un test) puede no mandarlo -- ausencia y
// string vacío se tratan igual (ningún valor "lleno").
export const HONEYPOT_FIELD_NAME = "referencia_extra" as const;
const createTicketExtraFieldsSchema = z.object({
  token: z.uuid(),
  formSessionId: z.uuid(),
  attachments: z
    .array(
      z.object({
        path: z.string().min(1),
        originalFilename: z.string().min(1),
        mimeType: z.string().min(1),
        sizeBytes: z.number().int().positive(),
      }),
    )
    .max(MAX_TICKET_PHOTOS),
  [HONEYPOT_FIELD_NAME]: z.string().optional().default(""),
});

// El `.refine()` de acá abajo es la validación real del honeypot: si viene
// con contenido, el parse entero falla -- createTicketAction ya trata
// cualquier fallo de parseo con el MISMO mensaje genérico que cualquier otro
// dato inválido ("Revisá los datos del formulario e intentá de nuevo."), así
// que un bot atrapado acá no recibe ninguna señal distinta de "mandaste
// algo mal" -- no hay forma de distinguir, desde afuera, "te agarré" de
// "tu request está mal formado".
export const createTicketInputSchema = publicTicketFormSchema
  .and(createTicketExtraFieldsSchema)
  .refine((data) => !data[HONEYPOT_FIELD_NAME], {
    message: "Revisá los datos del formulario e intentá de nuevo.",
    path: [HONEYPOT_FIELD_NAME],
  });

export type CreateTicketInput = z.input<typeof createTicketInputSchema>;
export type CreateTicketOutput = z.output<typeof createTicketInputSchema>;

// Vive acá y no en actions.ts: un archivo "use server" solo puede exportar
// funciones async -- mismo motivo que separó BulkPreviewState/
// initialBulkPreviewState de units/actions.ts hacia unit-schema.ts en el
// paso 4.3 (ver el comentario de ese archivo), aplicado acá al resultado de
// createTicketAction.
//
// `priority` se suma en el paso 5.8: la pantalla de confirmación arma el
// mensaje de WhatsApp (formatTicketMessage, paso 5.6) del lado del
// cliente, y la prioridad real del reclamo sale de la categoría
// (categories.default_priority), resuelta en el servidor -- el formulario
// público nunca le pide prioridad al vecino (paso 5.2), así que el cliente
// no tiene forma de saberla por su cuenta. Todo lo demás que ese mensaje
// necesita (nombre, unidad, categoría, descripción, cantidad de adjuntos)
// ya lo tiene el cliente en sus propios `values`, sin que la acción
// necesite repetirlo acá.
//
// `attachmentsToken` se suma en el paso 5.10: es la credencial del link
// de la galería de fotos (`tickets.attachments_token`, generada por la
// base con `defaultRandom()` -- ver esa columna en
// src/db/schema/tickets.ts), así que tampoco es algo que el cliente pueda
// inventar por su cuenta. Reemplaza a `publicCode` como identificador de
// la ruta `/s/[token]` -- ver el comentario de ese campo en
// `TicketMessageInput` (format-ticket-message.ts) para el motivo
// completo (public_code es corto y adivinable a propósito, inválido como
// credencial de algo privado).
export type CreateTicketState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "success";
      publicCode: string;
      priority: TicketMessagePriority;
      attachmentsToken: string;
    };

export const initialCreateTicketState: CreateTicketState = { status: "idle" };
