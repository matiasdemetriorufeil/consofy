import "./env";

import { createClient } from "@supabase/supabase-js";

import { requireEnv } from "./env";

// Limpieza del objeto real que el formulario público sube a Storage
// durante el flujo 1. Usa la ANON key (no la service-role): el bucket
// `ticket-attachments` le da a `anon` permiso de DELETE acotado a
// `pending/%` (migración 0019, ver CLAUDE.md > Fotos y adjuntos del
// formulario público), que es exactamente el prefijo bajo el que quedan
// estos objetos. Así la suite no necesita la service-role key para nada
// más que la cuenta de prueba.
export async function removePendingAttachments(
  storagePaths: string[],
): Promise<void> {
  if (storagePaths.length === 0) {
    return;
  }
  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  );
  const { error } = await supabase.storage
    .from("ticket-attachments")
    .remove(storagePaths);
  if (error) {
    throw new Error(
      `No se pudieron borrar los adjuntos de prueba de Storage (${storagePaths.join(", ")}): ${error.message}`,
    );
  }
}
