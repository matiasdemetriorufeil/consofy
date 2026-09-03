import "server-only";

import { env } from "@/lib/env";

// Arma el enlace público a partir del public_token (paso 4.6). La ruta en
// sí (/r/[token]) NO existe todavía -- la crea el paso 5.1, ver el
// comentario de la columna `publicToken` en src/db/schema/buildings.ts,
// que ya documenta ese path desde que se creó la columna. Hasta que el
// paso 5.1 exista, este enlace da 404 al abrirlo -- esperado, no un bug de
// este paso (lo dice también el reporte de esta tarea).
export function getBuildingPublicUrl(publicToken: string): string {
  return `${env.NEXT_PUBLIC_APP_URL}/r/${publicToken}`;
}

// Texto sugerido para el mensaje automático que el administrador configura
// en su WhatsApp Business (fuera de esta app: es Meta quien lo envía solo,
// cuando un vecino le escribe por primera vez). Por eso este texto NO pasa
// por MessagingProvider (ver CLAUDE.md > Reglas de WhatsApp): esa interfaz
// existe para los mensajes que la propia app arma y abre (el reclamo del
// vecino hacia el administrador), no para un texto que el administrador
// copia y pega a mano en una pantalla de configuración ajena a Consorfy --
// acá no hay ningún wa.me ni ningún envío real de por medio.
export function buildWhatsappAutoReplyMessage(
  buildingName: string,
  publicUrl: string,
): string {
  return `Este es un mensaje automático de ${buildingName}. Para cargar tu reclamo, completá este formulario: ${publicUrl}`;
}
