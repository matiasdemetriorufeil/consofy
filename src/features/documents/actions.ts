"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { documents } from "@/db/schema";
import { authorizedAction } from "@/lib/auth";
import { getActiveBuildings } from "@/features/buildings/queries";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  BUILDING_DOCUMENTS_BUCKET,
  buildDocumentStoragePath,
  canonicalMimeForFilename,
  documentUploadFieldsSchema,
  getDocumentDownloadInputSchema,
  getFileExtension,
  initialDocumentUploadState,
  setDocumentVisibilityInputSchema,
  validateDocumentFilename,
  validateDocumentSize,
  type DocumentUploadFieldErrors,
  type DocumentUploadState,
  type DocumentVisibility,
} from "./document-schema";
import { createDocumentDownloadUrl } from "./storage-objects";

function fieldError(
  field: keyof DocumentUploadFieldErrors,
  message: string,
): DocumentUploadState {
  return { ok: false, formError: null, fieldErrors: { [field]: message } };
}

function formError(message: string): DocumentUploadState {
  return { ok: false, formError: message, fieldErrors: {} };
}

// Subida de un documento a la biblioteca (paso 10.1). A diferencia de los
// adjuntos de reclamos (paso 5.4, que suben DIRECTO del navegador a Storage
// con la anon key porque el formulario público no tiene sesión), acá la
// subida corre en el SERVIDOR, detrás de `authorizedAction()`:
//
//  1. Se valida la sesión + se resuelve la organización (authorizedAction).
//  2. Se valida el edificio contra los edificios ACTIVOS de esa
//     organización -- ANTES de tocar Storage, para no dejar un objeto
//     huérfano si el edificio no corresponde. La FK compuesta
//     (building_id, organization_id) -> buildings es la defensa de base;
//     este chequeo previo es solo para dar un mensaje claro y no subir en
//     vano.
//  3. Se valida tipo (extensión) y tamaño (<= 10 MB) del archivo -- la
//     validación REAL, nunca se confía solo en el cliente
//     (CLAUDE.md > Reglas de seguridad).
//  4. Se sube a Storage con `createAdminClient()` (service-role key): el
//     bucket `building-documents` es privado y no tiene ninguna policy para
//     `anon`/`authenticated`, así que esta es la única vía de escritura --
//     mismo patrón "solo Storage" ya usado para firmar adjuntos (paso 5.10)
//     y documentado en src/lib/supabase/admin.ts.
//  5. Se inserta la fila en `documents`. Si el INSERT falla, se borra el
//     objeto recién subido para no dejarlo huérfano.
export const uploadDocumentAction = authorizedAction(
  async (
    context,
    _prevState: DocumentUploadState,
    formData: FormData,
  ): Promise<DocumentUploadState> => {
    const parsed = documentUploadFieldsSchema.safeParse({
      buildingId: formData.get("buildingId"),
      category: formData.get("category"),
      title: formData.get("title") ?? undefined,
      description: formData.get("description") ?? undefined,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path[0];
      if (
        field === "buildingId" ||
        field === "category" ||
        field === "title" ||
        field === "description"
      ) {
        return fieldError(field, issue!.message);
      }
      return formError("Revisá los datos del formulario e intentá de nuevo.");
    }

    const { buildingId, category, title, description } = parsed.data;

    // El archivo llega como `File` dentro del FormData.
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return fieldError("file", "Elegí un archivo para subir.");
    }

    // Edificio: tiene que ser uno activo de ESTA organización. Antes de
    // tocar Storage.
    const activeBuildings = await getActiveBuildings(context.organization.id);
    if (!activeBuildings.some((building) => building.id === buildingId)) {
      return fieldError(
        "buildingId",
        "Ese edificio no existe o ya no está activo.",
      );
    }

    const typeError = validateDocumentFilename(file.name);
    if (typeError) {
      return fieldError("file", typeError);
    }

    const sizeError = validateDocumentSize(file.size);
    if (sizeError) {
      return fieldError("file", sizeError);
    }

    const contentType = canonicalMimeForFilename(file.name);
    if (!contentType) {
      // Inalcanzable: validateDocumentFilename ya garantiza una extensión
      // conocida. Fail-closed explícito en vez de subir con un Content-Type
      // vacío.
      return fieldError("file", "No pudimos reconocer el tipo de ese archivo.");
    }

    const storagePath = buildDocumentStoragePath(
      buildingId,
      category,
      file.name,
    );
    // Título: lo tipeado, o el nombre del archivo sin la extensión.
    // `documents.title` es NOT NULL, así que siempre queda algo real.
    const filenameStem = file.name
      .slice(0, file.name.length - getFileExtension(file.name).length)
      .trim();
    const resolvedTitle = title ?? (filenameStem || file.name);

    const supabase = createAdminClient();
    const { error: uploadError } = await supabase.storage
      .from(BUILDING_DOCUMENTS_BUCKET)
      .upload(storagePath, file, { contentType, upsert: false });

    if (uploadError) {
      return formError(
        "No pudimos subir el archivo. Probá de nuevo en un momento.",
      );
    }

    try {
      await db.insert(documents).values({
        organizationId: context.organization.id,
        buildingId,
        category,
        title: resolvedTitle,
        description,
        storagePath,
        mimeType: contentType,
        sizeBytes: file.size,
        originalFilename: file.name,
        uploadedBy: context.appUser.displayName,
      });
    } catch {
      // El archivo ya está en Storage pero la fila no se pudo crear -- se
      // borra el objeto para no dejar un huérfano que ninguna fila
      // referencia.
      await supabase.storage
        .from(BUILDING_DOCUMENTS_BUCKET)
        .remove([storagePath]);
      return formError(
        "No pudimos guardar el documento. Probá de nuevo en un momento.",
      );
    }

    revalidatePath("/panel/documents");
    return { ...initialDocumentUploadState, ok: true };
  },
);

export type SetDocumentVisibilityResult =
  { ok: true; visibility: DocumentVisibility } | { ok: false; error: string };

// Cambia la visibilidad de UN documento (paso 10.3). Sin máquina de
// transiciones ni compare-and-swap: no hay "transición inválida" entre dos
// visibilidades (mismo criterio que `changeTicketPriorityAction`), y la
// dirección peligrosa -- pasar a "visible para vecinos" -- ya está
// protegida por un diálogo de confirmación en el cliente (ver
// DocumentVisibilityControl / MakeDocumentVisibleDialog), así que un click
// accidental o una pantalla obsoleta no pueden exponer un documento hacia
// afuera sin que alguien lo confirme explícitamente. Volver a "privado"
// (restringir) no necesita esa fricción -- riesgo R7 del plan
// (Ley 25.326), ver CLAUDE.md > Control de visibilidad de documentos.
//
// El `UPDATE ... WHERE id AND organization_id AND deleted_at IS NULL
// RETURNING` es el único chequeo que hace falta: un documento de otra
// organización (o borrado, o inexistente) no matchea ninguna fila y la
// acción devuelve el mismo mensaje ambiguo que el resto del proyecto,
// nunca revela si el id existe en otra organización. `updated_at` lo pone
// el trigger `set_updated_at`, no se setea a mano.
export const setDocumentVisibilityAction = authorizedAction(
  async (context, input: unknown): Promise<SetDocumentVisibilityResult> => {
    const parsed = setDocumentVisibilityInputSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Datos inválidos." };
    }
    const { documentId, visibility } = parsed.data;

    const [updated] = await db
      .update(documents)
      .set({ visibility })
      .where(
        and(
          eq(documents.id, documentId),
          eq(documents.organizationId, context.organization.id),
          isNull(documents.deletedAt),
        ),
      )
      .returning({ visibility: documents.visibility });

    if (!updated) {
      return { ok: false, error: "No encontramos ese documento." };
    }

    revalidatePath("/panel/documents");
    return { ok: true, visibility: updated.visibility };
  },
);

export type GetDocumentDownloadUrlResult =
  { ok: true; url: string } | { ok: false; error: string };

// Genera, BAJO DEMANDA, una URL firmada de corta duración para descargar
// UN documento (paso 10.4). Cierra el criterio de aceptación de la Etapa
// 10: el bucket `building-documents` no tiene ninguna policy de lectura
// (migración 0037), así que la ruta cruda de Storage no sirve el archivo a
// nadie -- la ÚNICA vía es esta URL firmada, y esta acción solo la emite
// después de:
//
//  1. `authorizedAction()` -- sesión válida.
//  2. El `SELECT ... WHERE id AND organization_id AND deleted_at IS NULL`
//     -- el documento pertenece a la organización de quien pide. Un id de
//     otra organización (o borrado, o inventado) no matchea y devuelve el
//     mismo mensaje ambiguo que el resto del proyecto.
//
// Recién ahí `createDocumentDownloadUrl()` (storage-objects.ts) usa
// `createAdminClient()` para firmar. Nunca se precalcula ni se guarda en
// una prop: la URL solo existe mientras alguien la está descargando, y
// vive 5 minutos (ver el comentario de DOCUMENT_DOWNLOAD_URL_EXPIRES_IN_SECONDS).
export const getDocumentDownloadUrlAction = authorizedAction(
  async (context, input: unknown): Promise<GetDocumentDownloadUrlResult> => {
    const parsed = getDocumentDownloadInputSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Datos inválidos." };
    }

    const [doc] = await db
      .select({
        storagePath: documents.storagePath,
        originalFilename: documents.originalFilename,
      })
      .from(documents)
      .where(
        and(
          eq(documents.id, parsed.data.documentId),
          eq(documents.organizationId, context.organization.id),
          isNull(documents.deletedAt),
        ),
      );

    if (!doc) {
      return { ok: false, error: "No encontramos ese documento." };
    }

    try {
      const url = await createDocumentDownloadUrl(
        doc.storagePath,
        doc.originalFilename,
      );
      return { ok: true, url };
    } catch {
      return {
        ok: false,
        error: "No pudimos preparar la descarga. Probá de nuevo en un momento.",
      };
    }
  },
);
