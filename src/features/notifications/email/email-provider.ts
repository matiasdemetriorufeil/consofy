// EmailProvider (paso 9.5) -- misma idea que MessagingProvider
// (announcements/messaging/messaging-provider.ts, paso 8.1) aplicada al
// canal de email: una interfaz chica y un objeto plano (no una clase, ver
// el comentario de MessagingProvider sobre por qué este proyecto no usa
// clases de servicio) para que el resto de la app nunca importe el SDK de
// Resend directo. El día que haga falta otro proveedor (ej. SES, Postmark),
// el único archivo nuevo es una segunda implementación de esta misma
// forma -- ningún caller cambia.
//
// A diferencia de MessagingProvider, acá no hace falta un `id` por
// implementación ni una variable de entorno que elija entre varias: hoy
// solo existe Resend, y no hay (todavía) un caso de uso real de "probar
// sin mandar nada de verdad" como sí lo tenía WhatsApp (ConsoleProvider) --
// el dominio de prueba de Resend ya cumple ese rol (ver el reporte del
// paso 9.5). Agregar esa selección el día que haga falta es sumar un
// `id`/factory, no reescribir esta interfaz.

export type EmailMessage = {
  to: string[];
  subject: string;
  html: string;
};

// `{ ok: true }` / `{ ok: false; error }` -- mismo criterio que
// MessagingAttemptResult: nunca lanza, el caller decide qué hacer con la
// falla (acá, siempre "loguear y seguir", ver send-admin-email.ts -- un
// email que no sale nunca puede tirar abajo el flujo que lo disparó,
// pedido explícito del paso 9.5).
export type EmailSendResult = { ok: true } | { ok: false; error: string };

export type EmailProvider = {
  send: (message: EmailMessage) => Promise<EmailSendResult>;
};
