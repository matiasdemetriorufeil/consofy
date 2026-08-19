import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";
import { createAdminClient } from "@/lib/supabase/admin";

import { TICKET_ATTACHMENTS_BUCKET } from "./ticket-schema";

// Defensa real contra "un storage_path que no subió él" (paso 5.5, análisis
// de seguridad): el cliente que llama a createTicketAction manda una lista
// de storage_path -- nada impide, a nivel de HTTP, que alguien arme ese
// payload a mano con un path que jamás subió (uno inventado, o uno real de
// OTRA sesión si de alguna forma lo conociera). Esta consulta confirma cuál
// de esos paths existe REALMENTE en el bucket antes de asociar nada --
// cualquier path que no aparezca acá se descarta en silencio (ver
// actions.ts), sin tirar abajo el resto del reclamo.
//
// Consulta directa a storage.objects (no es una tabla de nuestro schema de
// Drizzle, pero vive en la MISMA base Postgres -- storage.objects es una
// tabla real que administra el motor de Storage de Supabase, ver la
// migración 0019): la conexión de la app (`db`) usa el rol `postgres`, que
// evade RLS igual que en cualquier tabla propia (ver CLAUDE.md > Políticas
// RLS) -- no hace falta la service-role key ni el SDK de Storage para leer
// esto, es una SELECT más contra la misma base.
export async function getExistingAttachmentPaths(
  paths: string[],
): Promise<Set<string>> {
  if (paths.length === 0) {
    return new Set();
  }

  // sql.join(), no `name = any(${paths})`: encontrado en la práctica --
  // interpolar un array de JS directo en un fragmento sql`` de Drizzle no
  // lo serializa como literal de array de Postgres (postgres-js lo manda
  // como un único parámetro, que Postgres rechaza con "malformed array
  // literal"). Un IN armado con sql.join() (un placeholder por elemento,
  // separados por coma) es la forma soportada de Drizzle para una lista
  // dinámica de valores.
  const rows = await db.execute<{ name: string }>(sql`
    select name
    from storage.objects
    where bucket_id = ${TICKET_ATTACHMENTS_BUCKET}
      and name in (${sql.join(
        paths.map((path) => sql`${path}`),
        sql`, `,
      )})
  `);

  return new Set(Array.from(rows).map((row) => row.name));
}

// "Corta duración" (paso 5.10, CLAUDE.md > Reglas de seguridad -- no
// negociable) medida como una hora, no minutos: es una URL para que un
// administrador MIRE fotos en una pantalla, tal vez se distraiga y
// vuelva, no un link de descarga de un solo uso. Una hora es corta frente
// a lo que se está reemplazando (un link permanente sin vencimiento) y
// larga frente a lo que hace falta para ver una galería de hasta 5 fotos
// sin que se corten a mitad de sesión. Si en algún momento hace falta
// ajustarla, es UN número en un solo lugar.
const SIGNED_URL_EXPIRES_IN_SECONDS = 60 * 60;

// Única forma de generar una URL que sirva el CONTENIDO de un archivo del
// bucket privado `ticket-attachments` -- a diferencia de
// getExistingAttachmentPaths() (arriba, una SELECT de metadata contra
// storage.objects, que el rol `postgres` de la app ya puede leer sin
// nada especial), esto es una operación real del motor de Storage
// (firmar una URL), no una fila de una tabla -- necesita el SDK de
// Supabase con la service-role key (`createAdminClient`,
// src/lib/supabase/admin.ts), que evade las policies del bucket (sin
// SELECT para `anon`/`authenticated`, ver la migración 0019) igual que
// el rol `postgres` evade RLS en las tablas. Es EXACTAMENTE el uso que
// el paso 5.4 ya anticipó y documentó en CLAUDE.md ("una futura pantalla
// de administrador... va a pedir una URL firmada generada del lado del
// servidor con la service-role key").
//
// createSignedUrls() (plural, un solo request para varios paths) en vez
// de un createSignedUrl() por archivo en un loop: menos round-trips a la
// API de Storage para una galería de varias fotos.
//
// Devuelve un Map -- silenciosamente SIN entrada para cualquier path que
// falle (archivo borrado del bucket por fuera de la app, por ejemplo):
// el caller (la página de la galería) decide qué hacer con un adjunto sin
// URL en vez de que esta función tire abajo toda la galería por un solo
// archivo problemático.
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
