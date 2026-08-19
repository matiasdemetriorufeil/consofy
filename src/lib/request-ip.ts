import "server-only";

import { headers } from "next/headers";

// Extraído de src/features/auth/login-rate-limit.ts (paso 3.2) al paso 5.11,
// que es el segundo consumidor real -- mismo criterio ya usado en este
// proyecto para decidir cuándo separar un helper compartido (ver
// ticket-schema.ts, AR_WHATSAPP_*). No tiene nada de dominio (ni de auth ni
// de reclamos): lee un header y devuelve un string, por eso vive acá y no en
// src/features/.
//
// x-forwarded-for/x-real-ip: los que setea el proxy de Vercel delante de la
// app -- no hay forma de conocer la IP real del cliente en Node sin pasar
// por estos headers en un deploy serverless. En desarrollo local ninguno de
// los dos suele venir seteado, de ahí el fallback.
export async function getClientIp(): Promise<string> {
  const headersList = await headers();
  const forwardedFor = headersList.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]!.trim();
  }
  return headersList.get("x-real-ip") ?? "unknown";
}
