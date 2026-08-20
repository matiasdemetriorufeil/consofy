import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { TICKET_ATTACHMENTS_BUCKET } from "@/features/public-form/ticket-schema";

// Movido acá desde public-form/storage-objects.ts en el paso 6.3, cuando
// apareció el segundo consumidor real: la galería pública (/s/[token],
// paso 5.10) y ahora la vista de detalle del panel (/panel/tickets/
// [ticketId]) necesitan exactamente la misma operación -- firmar URLs de
// corta duración para los adjuntos de UN reclamo. Mismo criterio de
// extracción ya usado en este proyecto (AR_WHATSAPP_*, getClientIp): se
// factoriza recién con el segundo consumidor real, no antes. Vive en
// `tickets/` y no en `public-form/`: firmar adjuntos de un reclamo es un
// concepto del DOMINIO tickets (la tabla es ticket_attachments), no algo
// específico del flujo de intake -- public-form sigue siendo dueño de
// `getExistingAttachmentPaths()` (esa sí es una validación específica del
// paso 5.5, "¿este path lo subió esta sesión?"), y de `TICKET_ATTACHMENTS_BUCKET`
// (la constante del bucket vive junto al resto de las constantes de
// adjuntos del formulario -- MAX_TICKET_PHOTOS, los mime types aceptados
// -- se importa acá en vez de duplicarla).

// "Corta duración" (paso 5.10, CLAUDE.md > Reglas de seguridad -- no
// negociable) medida como una hora, no minutos: ver el razonamiento
// completo en el comentario original de este archivo (CLAUDE.md > Galería
// pública de adjuntos) -- se mantiene sin cambios en la mudanza.
const SIGNED_URL_EXPIRES_IN_SECONDS = 60 * 60;

// Única forma de generar una URL que sirva el CONTENIDO de un archivo del
// bucket privado `ticket-attachments` -- necesita el SDK de Supabase con la
// service-role key (`createAdminClient`, src/lib/supabase/admin.ts), que
// evade las policies del bucket (sin SELECT para `anon`/`authenticated`,
// ver la migración 0019) igual que el rol `postgres` evade RLS en las
// tablas.
//
// createSignedUrls() (plural, un solo request para varios paths) en vez de
// un createSignedUrl() por archivo en un loop: menos round-trips a la API
// de Storage para una galería de varias fotos.
//
// Devuelve un Map -- silenciosamente SIN entrada para cualquier path que
// falle (archivo borrado del bucket por fuera de la app, por ejemplo): el
// caller decide qué hacer con un adjunto sin URL en vez de que esta función
// tire abajo toda la galería por un solo archivo problemático.
export async function createSignedAttachmentUrls(
  paths: string[],
): Promise<Map<string, string>> {
  if (paths.length === 0) {
    return new Map();
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(TICKET_ATTACHMENTS_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_EXPIRES_IN_SECONDS);

  if (error) {
    throw error;
  }

  const urls = new Map<string, string>();
  for (const item of data) {
    if (item.path && item.signedUrl && !item.error) {
      urls.set(item.path, item.signedUrl);
    }
  }
  return urls;
}
