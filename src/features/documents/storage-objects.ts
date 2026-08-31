import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { BUILDING_DOCUMENTS_BUCKET } from "./document-schema";

// Firma la URL de descarga de UN documento (paso 10.4) -- paralelo a
// `createSignedAttachmentUrls` (tickets/storage-objects.ts, pasos 5.10/
// 6.3), con dos diferencias deliberadas respecto de aquel:
//
//  1. `createSignedUrl` SINGULAR, no `createSignedUrls` plural. Tickets
//     firma la galería entera de un reclamo de una sola vez (varios paths,
//     un round-trip); acá es un documento puntual, pedido BAJO DEMANDA
//     (al click de "Descargar"), nunca la lista entera de golpe.
//
//  2. `{ download: <nombre original> }` -- Supabase agrega
//     `Content-Disposition: attachment; filename="..."` a la respuesta, así
//     el navegador GUARDA el archivo con su nombre real
//     (`documents.original_filename`) en vez de abrirlo inline o guardarlo
//     con el basename sanitizado del `storage_path`. Los adjuntos de
//     reclamos se ABREN inline en una pestaña (son fotos que se miran);
//     un documento administrativo se BAJA.
//
// Duración: 5 minutos, MÁS CORTA que la hora de `createSignedAttachmentUrls`
// -- desviación con motivo concreto (CLAUDE.md > Reglas de seguridad pide
// "corta duración"; la hora de tickets está justificada como "una sesión de
// lectura real: el administrador puede distraerse, volver, mirar varias
// fotos"). Acá no hay sesión de lectura: la URL se genera en el momento del
// click y el navegador la consume en segundos. 5 minutos cubre con margen
// un "Guardar como" lento o un reintento, sin dejar viva una hora entera
// una URL que sirve bytes sin volver a chequear la sesión. Ver CLAUDE.md >
// Descarga de documentos (paso 10.4).
export const DOCUMENT_DOWNLOAD_URL_EXPIRES_IN_SECONDS = 60 * 5;

// Única forma de generar una URL que sirva el CONTENIDO de un archivo del
// bucket privado `building-documents` -- necesita el SDK de Supabase con la
// service-role key (`createAdminClient`, src/lib/supabase/admin.ts), que
// evade la ausencia de policies del bucket (sin ningún acceso para
// `anon`/`authenticated`, ver la migración 0037) igual que el rol
// `postgres` evade RLS en las tablas.
//
// Tira si Storage devuelve un error (mismo criterio que
// `createSignedAttachmentUrls`) -- el caller (la Server Action) lo traduce
// a un mensaje para el administrador.
export async function createDocumentDownloadUrl(
  storagePath: string,
  downloadFilename: string,
): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(BUILDING_DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, DOCUMENT_DOWNLOAD_URL_EXPIRES_IN_SECONDS, {
      download: downloadFilename,
    });

  if (error || !data?.signedUrl) {
    throw error ?? new Error("Storage no devolvió una URL firmada.");
  }
  return data.signedUrl;
}
