import { z } from "zod";

// Compartido entre cliente (DocumentUploadForm, feedback inmediato) y
// servidor (actions.ts, la validación REAL) -- mismo patrón que
// ticket-schema.ts / reminder-schema.ts. Ver CLAUDE.md > Reglas de
// seguridad: toda entrada se valida con Zod EN EL SERVIDOR aunque el
// cliente ya la haya validado.
//
// Este archivo es puro (sin `import "server-only"`): las funciones de
// validación de tipo/tamaño y de armado de path se testean con Vitest sin
// infraestructura de servidor -- mismo criterio que normalize-ticket-text.ts
// (paso 7.1) o reminder-urgency.ts (paso 9.2).

// -----------------------------------------------------------------------
// Categorías -- lista fija a nivel de APLICACIÓN, no una tabla ni un enum
// de Postgres.
// -----------------------------------------------------------------------
// `documents.category` es `text` en la base, a propósito -- ver el
// comentario de esa columna en src/db/schema/documents.ts ("Si hace falta
// una lista fija se valida con Zod en la aplicación -- no se modela una
// tabla nueva para esto ahora"). Este es ese momento: se validan las seis
// categorías acá con `z.enum`, sin migración ni columna nueva.
//
// La ETIQUETA en español es lo que ve el administrador; el VALOR en inglés
// es lo que se guarda en la base y lo que aparece en el path de Storage.
// Traducción documentada acá para que el mapeo no quede implícito:
//   reglamento     -> regulations
//   actas          -> minutes
//   balances       -> balance_sheets
//   seguros        -> insurance
//   avisos         -> notices        (NO `announcements`: evita colisión de
//                                     concepto/grep con el dominio de
//                                     comunicados, que en el código ya usa
//                                     `announcement*`)
//   otros          -> other
export const DOCUMENT_CATEGORIES = [
  "regulations",
  "minutes",
  "balance_sheets",
  "insurance",
  "notices",
  "other",
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const DOCUMENT_CATEGORY_LABEL: Record<DocumentCategory, string> = {
  regulations: "Reglamento",
  minutes: "Actas",
  balance_sheets: "Balances",
  insurance: "Seguros",
  notices: "Avisos",
  other: "Otros",
};

export function isDocumentCategory(value: string): value is DocumentCategory {
  return (DOCUMENT_CATEGORIES as readonly string[]).includes(value);
}

// Etiqueta en español de una categoría que viene como `string` de la base
// (`documents.category` es `text`, no un enum -- ver el schema). Si algún
// día hay un valor fuera de la lista, cae al valor crudo en vez de romper.
// Extraída de document-list.tsx (paso 10.2) al paso 11.3, que la necesita
// también en la superficie pública -- una sola definición para las dos.
export function documentCategoryLabel(category: string): string {
  return isDocumentCategory(category)
    ? DOCUMENT_CATEGORY_LABEL[category]
    : category;
}

// -----------------------------------------------------------------------
// Tipo y tamaño de archivo
// -----------------------------------------------------------------------
// PDF, Word (.doc/.docx), Excel (.xls/.xlsx) e imágenes (.jpg/.jpeg/.png).
// La EXTENSIÓN es la fuente de verdad de "qué clase de archivo es": el
// `File.type` que reporta el navegador para .doc/.xls es poco confiable
// (a veces llega vacío o como `application/octet-stream`). Al subir a
// Storage se manda un Content-Type CANÓNICO derivado de la extensión (ver
// `canonicalMimeForFilename`), para que el chequeo `allowed_mime_types`
// del bucket pase de forma determinística.
export const ALLOWED_DOCUMENT_EXTENSIONS = [
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".jpg",
  ".jpeg",
  ".png",
] as const;

const EXTENSION_TO_CANONICAL_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

// 10 MB. Justificación en la migración 0037 y en CLAUDE.md > Biblioteca de
// documentos: subida (paso 10.1).
export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;

// Etiqueta corta de los tipos permitidos, para el texto del <input> y de
// los mensajes de error -- una sola fuente, sin repetir la lista a mano.
export const ALLOWED_DOCUMENT_TYPES_HELP =
  "PDF, Word (.doc/.docx), Excel (.xls/.xlsx) o imagen (.jpg/.jpeg/.png)";

export function getFileExtension(filename: string): string {
  const match = /\.[a-z0-9]+$/i.exec(filename.trim());
  return match ? match[0].toLowerCase() : "";
}

// Devuelve el mensaje de error, o `null` si el nombre/extensión es válido
// -- mismo contrato que validateAttachmentType (ticket-schema.ts).
export function validateDocumentFilename(filename: string): string | null {
  const ext = getFileExtension(filename);
  if (!ext) {
    return `El archivo no tiene extensión. Subí un ${ALLOWED_DOCUMENT_TYPES_HELP}.`;
  }
  if (!(ALLOWED_DOCUMENT_EXTENSIONS as readonly string[]).includes(ext)) {
    return `Ese tipo de archivo no está permitido. Subí un ${ALLOWED_DOCUMENT_TYPES_HELP}.`;
  }
  return null;
}

export function validateDocumentSize(sizeBytes: number): string | null {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return "El archivo está vacío.";
  }
  if (sizeBytes > MAX_DOCUMENT_SIZE_BYTES) {
    return "El archivo supera el límite de 10 MB.";
  }
  return null;
}

// El Content-Type canónico que se le pasa a Storage al subir -- derivado
// de la extensión, no del `File.type` del navegador. `null` si la
// extensión no está permitida (el caller ya validó con
// `validateDocumentFilename`, así que en la práctica nunca es `null`).
export function canonicalMimeForFilename(filename: string): string | null {
  return EXTENSION_TO_CANONICAL_MIME[getFileExtension(filename)] ?? null;
}

// -----------------------------------------------------------------------
// Path de Storage
// -----------------------------------------------------------------------
// `{building_id}/{category}/{uuid}-{nombre-sanitizado}.{ext}` -- organizado
// por edificio y categoría, con un uuid al frente para que dos archivos con
// el mismo nombre nunca choquen. El nombre original completo se guarda
// aparte en `documents.original_filename` (sin sanitizar); acá solo se
// necesita algo legible y seguro para un path.
export function sanitizeFilenameStem(filename: string): string {
  const ext = getFileExtension(filename);
  const stem = ext ? filename.slice(0, -ext.length) : filename;
  const normalized = stem
    .normalize("NFKD")
    // Saca las marcas de combinación Unicode (las tildes que NFKD separó de
    // su letra): U+0300–U+036F. `new RegExp` con string escapado para no
    // meter caracteres combinantes crudos en el código fuente.
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return normalized || "documento";
}

// `uuid` es un parámetro (con default) para poder testear el armado del
// path contra un valor fijo -- mismo criterio que `today`/`now` en
// reminder-urgency.ts / find-similar-tickets.ts.
//
// `category` es `string`, no `DocumentCategory`: acá solo es un segmento
// del path. El reemplazo del paso 10.5 lo llama con `documents.category`
// crudo de la base (columna `text`), que para cualquier fila real ya es
// uno de los valores del enum -- pero tiparlo como `string` evita un cast
// en ese call site.
export function buildDocumentStoragePath(
  buildingId: string,
  category: string,
  originalFilename: string,
  uuid: string = crypto.randomUUID(),
): string {
  const ext = getFileExtension(originalFilename);
  return `${buildingId}/${category}/${uuid}-${sanitizeFilenameStem(originalFilename)}${ext}`;
}

// -----------------------------------------------------------------------
// Campos del formulario (todo menos el archivo en sí)
// -----------------------------------------------------------------------
// El archivo viaja como `File` dentro del `FormData` de la Server Action y
// se valida aparte (tipo/tamaño arriba) -- no encaja en un schema de
// campos de texto, mismo criterio que los adjuntos en ticket-schema.ts.

// Título: opcional en todos los flujos (alta 10.1, reemplazo 10.5). Si se
// deja vacío, la Server Action cae al nombre del archivo. `documents.title`
// es NOT NULL, así que del schema sale `string | null` y la acción resuelve
// el fallback.
const optionalDocumentTitleSchema = z
  .string()
  .trim()
  .max(200, "Como máximo 200 caracteres.")
  .optional()
  .transform((value) => (value ? value : null));

export const documentUploadFieldsSchema = z.object({
  buildingId: z.uuid("Elegí un edificio."),
  category: z.enum(DOCUMENT_CATEGORIES, { message: "Elegí una categoría." }),
  title: optionalDocumentTitleSchema,
  description: z
    .string()
    .trim()
    .max(2000, "Como máximo 2000 caracteres.")
    .optional()
    .transform((value) => (value ? value : null)),
});

// Reemplazo de un documento (paso 10.5) -- el `documentId` de la fila a
// reemplazar + el título editable (opcional). El archivo nuevo viaja
// aparte en el `FormData` y se valida con
// `validateDocumentFilename`/`validateDocumentSize`. `building_id`,
// `category`, `visibility` y `description` se HEREDAN de la fila anterior,
// no se editan en este flujo.
export const replaceDocumentFieldsSchema = z.object({
  documentId: z.uuid(),
  title: optionalDocumentTitleSchema,
});

export type DocumentUploadFieldsInput = z.input<
  typeof documentUploadFieldsSchema
>;

export type DocumentUploadFieldErrors = Partial<
  Record<"buildingId" | "category" | "title" | "description" | "file", string>
>;

export type DocumentUploadState = {
  ok: boolean;
  formError: string | null;
  fieldErrors: DocumentUploadFieldErrors;
};

export const initialDocumentUploadState: DocumentUploadState = {
  ok: false,
  formError: null,
  fieldErrors: {},
};

export const BUILDING_DOCUMENTS_BUCKET = "building-documents";

// -----------------------------------------------------------------------
// Visibilidad
// -----------------------------------------------------------------------
// Espejo del enum `document_visibility` de src/db/schema/documents.ts --
// que SÍ es un pgEnum real (a diferencia de `category`, que es `text`).
// `private`: solo el administrador; `residents`: los vecinos del edificio
// (el consumo real desde el portal del vecino es el paso 11.3 -- este paso
// solo guarda el flag). Se define acá inline en vez de importar el pgEnum,
// mismo criterio que `DOCUMENT_CATEGORIES` arriba (este archivo es puro,
// sin dependencias del cliente de base -- lo importan Client Components).
export const DOCUMENT_VISIBILITY_VALUES = ["private", "residents"] as const;
export type DocumentVisibility = (typeof DOCUMENT_VISIBILITY_VALUES)[number];

export const DOCUMENT_VISIBILITY_LABEL: Record<DocumentVisibility, string> = {
  private: "Privado",
  residents: "Visible para vecinos",
};

// Entrada de `setDocumentVisibilityAction` (paso 10.3) -- validada con Zod
// en el servidor, aunque el control del panel solo mande valores válidos
// (CLAUDE.md > Reglas de seguridad).
export const setDocumentVisibilityInputSchema = z.object({
  documentId: z.uuid(),
  visibility: z.enum(DOCUMENT_VISIBILITY_VALUES),
});

// Entrada de `getDocumentDownloadUrlAction` (paso 10.4) -- solo el id; la
// pertenencia a la organización la verifica la acción antes de firmar nada.
export const getDocumentDownloadInputSchema = z.object({
  documentId: z.uuid(),
});

// -----------------------------------------------------------------------
// Tipo de archivo para la UI -- derivado del mime_type ya guardado
// -----------------------------------------------------------------------
// El explorador muestra una etiqueta corta + un ícono por fila (paso
// 10.2). `mime_type` en la base es siempre uno de los siete canónicos que
// escribe la subida (ver `EXTENSION_TO_CANONICAL_MIME`) -- `other` es solo
// la red de seguridad para una fila vieja o cargada por fuera de ese flujo.
export type FileKind = "pdf" | "word" | "excel" | "image" | "other";

export function getFileKind(mimeType: string): FileKind {
  if (mimeType === "application/pdf") {
    return "pdf";
  }
  if (
    mimeType === "application/msword" ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "word";
  }
  if (
    mimeType === "application/vnd.ms-excel" ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return "excel";
  }
  if (mimeType === "image/jpeg" || mimeType === "image/png") {
    return "image";
  }
  return "other";
}

export const FILE_KIND_LABEL: Record<FileKind, string> = {
  pdf: "PDF",
  word: "Word",
  excel: "Excel",
  image: "Imagen",
  other: "Archivo",
};

// Tamaño legible para la UI -- misma forma que `formatBytes` en
// public-form/upload-attachment.ts, reescrita acá para no importar ese
// módulo (que arrastra el cliente de Supabase del navegador).
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${Math.round(kb)} KB`;
  }
  return `${(kb / 1024).toFixed(1)} MB`;
}
