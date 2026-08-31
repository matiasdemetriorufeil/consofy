import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import { publicEnv } from "@/lib/env.public";

// Cliente con la service-role key (paso 5.10) -- evade RLS y las policies
// de `anon`/`authenticated` por completo, ver CLAUDE.md > Políticas RLS y
// > Reglas de entorno ("la service-role key no se usa salvo pedido
// explícito"). Este es exactamente ese caso, anticipado desde el paso 5.4:
// el bucket `ticket-attachments` no le da SELECT a nadie que no sea este
// rol (ver la migración 0019) -- es la ÚNICA forma de generar una URL
// firmada para servir una foto, no una elección de comodidad.
//
// USO ACOTADO A PROPÓSITO: solo Storage. Consumidores reales:
//  - `createSignedAttachmentUrls` (src/features/tickets/storage-objects.ts
//    -- paso 5.10, movido a tickets/ en el 6.3): firma URLs de corta
//    duración para LEER los adjuntos de un reclamo del bucket privado
//    `ticket-attachments` (la galería `/s/[token]` y la vista de detalle
//    del panel).
//  - `uploadDocumentAction` (src/features/documents/actions.ts, paso 10.1):
//    ESCRIBE en el bucket privado `building-documents`, que no tiene ninguna
//    policy para `anon`/`authenticated` -- la subida corre en el servidor
//    detrás de `authorizedAction()`, así que esta es la única vía. También
//    BORRA el objeto si el INSERT de la fila falla.
//  - `createDocumentDownloadUrl` (src/features/documents/storage-objects.ts,
//    paso 10.4), llamada solo desde `getDocumentDownloadUrlAction`
//    (`authorizedAction()` + chequeo de que el documento es de la
//    organización): firma la URL de descarga de UN documento, bajo demanda,
//    de `building-documents`. Igual que en el bucket de adjuntos, sus
//    policies no dan lectura a nadie, así que la URL firmada es la única
//    forma de servir el archivo -- eso es lo que cierra el criterio de
//    aceptación de la Etapa 10 (la ruta cruda de Storage no sirve nada).
//  - `addResidentUpdateAction` (src/features/public-form/actions.ts, paso
//    11.4): ESCRIBE en el bucket privado `ticket-attachments` (bajo
//    `pending/`) las fotos que el vecino agrega a un reclamo abierto desde
//    `/s/[token]`. ÚNICO consumidor PÚBLICO (sin sesión): la "autorización"
//    es el `attachments_token` del reclamo + que esté abierto + rate limit,
//    todo chequeado ANTES de subir. La subida podría hacerse también con la
//    anon key (la policy de la migración 0019 le permite INSERT en
//    `pending/%`), pero se usa esta vía para no introducir un cuarto patrón
//    de construcción de cliente Supabase -- la validación de la acción es
//    la compuerta real en cualquiera de las dos. Solo sube; si el INSERT de
//    las filas falla, BORRA lo que subió.
//  - `getStorageUsage` (src/features/documents/storage-usage.ts, paso 10.6),
//    llamada desde la page `/panel/documents` (sesión de administrador ya
//    exigida por el layout de `/panel`): ENUMERA (list recursivo) los dos
//    buckets privados `building-documents` y `ticket-attachments` y suma el
//    tamaño de cada objeto, para el indicador de cuota (uso vs. el 1 GB del
//    plan). Es un tipo de uso NUEVO: recorrer un bucket entero, no
//    firmar/subir/borrar un objeto puntual. Solo lectura -- no toca ningún
//    objeto. El `list` del bucket tampoco tiene policy para
//    `anon`/`authenticated`, así que la service-role es la única vía; la
//    alternativa (leer `storage.objects` con el rol `postgres`, sin esta
//    clave) queda anotada en storage-usage.ts como camino de escala.
// Nunca para leer ni escribir tablas de negocio -- esas siguen pasando
// SIEMPRE por Drizzle (`src/db/index.ts`, que ya evade RLS con el rol
// `postgres`, sin necesitar esta clave -- ver CLAUDE.md > Acceso a datos).
// Mezclar los dos clientes para la misma tarea sería la clase de atajo que
// las Reglas de entorno piden evitar.
//
// No se cachea en una variable de módulo ni se reusa entre requests, mismo
// criterio que src/lib/supabase/server.ts: cada llamada arma un cliente
// nuevo, liviano (no hay estado de sesión que preservar acá, a diferencia
// del cliente de Auth).
export function createAdminClient() {
  return createSupabaseClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
