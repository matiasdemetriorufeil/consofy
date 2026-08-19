import { createClient } from "@/lib/supabase/client";

import { checkAttachmentUploadAllowedAction } from "./actions";
import { compressImage, AttachmentUploadError } from "./compress-image";

export { AttachmentUploadError };
import {
  isAcceptedDocumentFile,
  isAcceptedImageFile,
  TICKET_ATTACHMENTS_BUCKET,
  validateAttachmentSize,
} from "./ticket-schema";

// Subida de fotos/PDF ANTES de que el reclamo exista en la base (paso
// 5.4) -- el ticket_id real recién se crea en el paso 5.5. La relación
// entre "esto que subo ahora" y "el reclamo que se va a crear después" se
// resuelve con un `formSessionId`: un uuid que TicketForm genera una sola
// vez al montar el formulario (ver ticket-form.tsx) y que viaja como
// prefijo de cada archivo: `pending/<formSessionId>/<índice>-<uuid>.<ext>`.
//
// Por qué un prefijo "pending/" y no subir directo bajo un ticket_id
// todavía inexistente: no hay otra opción real -- no existe un id al que
// asociar el archivo hasta que el paso 5.5 corra el INSERT. La alternativa
// hubiera sido generar el uuid del ticket en el CLIENTE por adelantado
// (crypto.randomUUID(), pasado luego como id explícito al INSERT de
// 5.5) y subir directo bajo `tickets/<ese-id>/...` -- la descarté: hace que
// la integridad del id dependa de que el cliente nunca reutilice ni
// corrompa ese uuid antes de que el server lo valide, y complica el caso
// "el vecino nunca confirma" (quedaría un ticket_id "reservado" que ningún
// código libera). `pending/<formSessionId>/` es más simple: cuando el
// paso 5.5 cree el reclamo, va a insertar en ticket_attachments con el
// storage_path TAL CUAL quedó acá (sin mover ni renombrar el objeto en
// Storage) -- un archivo "pasa a pertenecer" al reclamo en cuanto una fila
// de ticket_attachments lo referencia, no antes. Los que nunca se
// reclaman (el vecino abandona el formulario) quedan huérfanos bajo
// pending/ -- ver el Pendiente que este paso deja anotado en CLAUDE.md
// sobre su limpieza periódica.
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(0)} KB`;
  }
  return `${(kb / 1024).toFixed(1)} MB`;
}

export type UploadedAttachment = {
  path: string;
  originalFilename: string;
  sizeBytes: number;
  mimeType: string;
};

function extensionFor(mimeType: string): string {
  if (mimeType === "application/pdf") {
    return "pdf";
  }
  return "jpg"; // toda imagen se reencoda a JPEG en compress-image.ts
}

// Sube UN archivo ya validado por tipo (ver validateAttachmentType en
// ticket-schema.ts, llamado ANTES de esto por el caller). Comprime si es
// imagen; un PDF sube tal cual (no hay forma de comprimir un PDF del lado
// del cliente sin una librería nueva, y el enunciado no la pide -- ver el
// criterio completo sobre PDF en el reporte).
//
// Rate limiting por IP (paso 5.11): esta función sube DIRECTO del navegador
// a Supabase Storage (createClient(), la anon key) -- nunca pasa por
// nuestro servidor de Next, así que no hay ninguna Server Action "de
// subida" existente donde meter un chequeo. La solución es una compuerta
// SEPARADA (checkAttachmentUploadAllowedAction, en actions.ts) que sí corre
// en nuestro servidor: se pregunta ANTES de tocar Storage, y si no da
// permiso, esta función tira AttachmentUploadError con un mensaje humano en
// vez de intentar la subida real -- el mismo tipo de error que ya maneja el
// caller (ver el .catch() en TicketForm), así que no hace falta ningún
// manejo nuevo del lado de la UI.
export async function uploadFormAttachment(
  file: File,
  formSessionId: string,
  index: number,
): Promise<UploadedAttachment> {
  const { allowed } = await checkAttachmentUploadAllowedAction();
  if (!allowed) {
    throw new AttachmentUploadError(
      "Estás subiendo archivos muy rápido. Esperá un momento e intentá de nuevo.",
    );
  }

  let body: Blob = file;
  let mimeType = file.type;

  if (isAcceptedImageFile(file)) {
    body = await compressImage(file);
    mimeType = "image/jpeg";
  } else if (!isAcceptedDocumentFile(file)) {
    // No debería llegar acá: el caller ya valida el tipo antes de invocar
    // esta función. Fail-closed explícito en vez de subir algo no
    // reconocido.
    throw new AttachmentUploadError("Tipo de archivo no permitido.");
  }

  const sizeError = validateAttachmentSize(body.size);
  if (sizeError) {
    throw new AttachmentUploadError(sizeError);
  }

  const path = `pending/${formSessionId}/${index}-${crypto.randomUUID()}.${extensionFor(mimeType)}`;

  const supabase = createClient();
  const { error } = await supabase.storage
    .from(TICKET_ATTACHMENTS_BUCKET)
    .upload(path, body, { contentType: mimeType, upsert: false });

  if (error) {
    throw error;
  }

  return {
    path,
    originalFilename: file.name,
    sizeBytes: body.size,
    mimeType,
  };
}

// Borra un archivo ya subido -- se usa cuando el vecino saca una foto de
// la lista en el paso 3 (ver removePhoto en ticket-form.tsx), para no
// dejar un huérfano en Storage por algo que el propio vecino decidió sacar
// antes de confirmar nada. No lanza si falla (el archivo, en el peor caso,
// queda huérfano bajo pending/ -- el mismo destino que ya tiene cualquier
// foto de un formulario abandonado, no un caso nuevo que haya que tratar
// de forma especial).
export async function deleteFormAttachment(path: string): Promise<void> {
  const supabase = createClient();
  await supabase.storage.from(TICKET_ATTACHMENTS_BUCKET).remove([path]);
}
