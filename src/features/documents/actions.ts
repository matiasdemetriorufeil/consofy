"use server";

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
  getFileExtension,
  initialDocumentUploadState,
  validateDocumentFilename,
  validateDocumentSize,
  type DocumentUploadFieldErrors,
  type DocumentUploadState,
} from "./document-schema";

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
