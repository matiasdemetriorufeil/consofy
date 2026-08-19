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
// USO ACOTADO A PROPÓSITO: solo Storage (`createSignedAttachmentUrls`,
// src/features/public-form/storage-objects.ts). Nunca para leer ni
// escribir tablas de negocio -- esas siguen pasando SIEMPRE por Drizzle
// (`src/db/index.ts`, que ya evade RLS con el rol `postgres`, sin
// necesitar esta clave -- ver CLAUDE.md > Acceso a datos). Mezclar los
// dos clientes para la misma tarea sería la clase de atajo que las Reglas
// de entorno piden evitar.
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
