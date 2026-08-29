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
//    -- paso 5.10, movido a tickets/ en el 6.3): firma URLs para leer el
//    bucket privado `ticket-attachments`.
//  - `uploadDocumentAction` (src/features/documents/actions.ts, paso 10.1):
//    escribe en el bucket privado `building-documents`, que no tiene ninguna
//    policy para `anon`/`authenticated` -- la subida corre en el servidor
//    detrás de `authorizedAction()`, así que esta es la única vía. Las
//    lecturas firmadas de ese bucket (paso 10.4) van a pasar por acá también.
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
