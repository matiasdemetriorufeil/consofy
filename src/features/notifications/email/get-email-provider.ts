import "server-only";

import { resendProvider } from "./resend-provider";
import type { EmailProvider } from "./email-provider";

// Único punto del proyecto que decide QUÉ implementación de EmailProvider
// se usa -- mismo criterio que getMessagingProvider() (announcements/
// messaging/get-messaging-provider.ts, paso 8.1). Hoy siempre Resend, sin
// variable de entorno que elija entre varias (a diferencia de
// MESSAGING_PROVIDER -- ver el comentario de email-provider.ts sobre por
// qué no hace falta todavía): el punto de este archivo no es la selección
// en sí, es que ningún caller (send-admin-email.ts) importe
// `resendProvider` directo -- así, el día que exista un segundo proveedor
// real, agregarlo es tocar ESTA función nada más.
export function getEmailProvider(): EmailProvider {
  return resendProvider;
}
