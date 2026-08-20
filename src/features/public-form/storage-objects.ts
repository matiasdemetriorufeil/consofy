import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";

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

// createSignedAttachmentUrls() vivía acá -- se movió a
// src/features/tickets/storage-objects.ts en el paso 6.3, cuando la vista
// de detalle del panel se volvió su segundo consumidor real (junto con
// /s/[token]). Ver el comentario de ese archivo para el razonamiento
// completo.
