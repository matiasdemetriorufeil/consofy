import "server-only";

import { getMessagingProvider } from "./messaging/get-messaging-provider";

export type PreparedWhatsAppLink =
  { ok: true; url: string | null } | { ok: false; error: string };

// Arma el link de WhatsApp para UN destinatario 'pending' (paso 8.5) --
// SOLO LECTURA, no marca nada en la base. Vive en un módulo con
// `import "server-only"`, NUNCA `"use server"` -- a propósito, distinto de
// actions.ts: toda función exportada de un archivo `"use server"` queda
// invocable como Server Action directa por cualquiera, con o sin sesión
// (ver CLAUDE.md > Autorización de rutas y Server Actions, "las Server
// Actions son invocables de forma directa, sin pasar por ningún layout").
// Esta función no valida ninguna sesión ni pertenencia a una organización
// -- se llama desde el Server Component de la pantalla de envío
// (page.tsx), que YA resolvió `requireUser()` antes, así que exponerla
// como Server Action sería una superficie de invocación sin autorización
// (cualquiera podría pedir un link de WhatsApp con un teléfono/mensaje
// arbitrario). `import "server-only"` (no `"use server"`) es justo lo que
// impide que termine expuesta así: solo se puede importar desde otro
// módulo de servidor, nunca queda en el manifiesto de Server Actions.
//
// Se llama desde el Server Component para tener el `href` YA resuelto
// antes de que el administrador toque el botón (mismo criterio que
// TicketForm/paso 5.8 con buildWhatsAppUrl: un `<a href>` con la URL ya
// calculada abre al toque, sin depender de un round-trip async que un
// bloqueador de pop-ups podría frenar). SIEMPRE pasa por
// getMessagingProvider() -- nunca arma la URL a mano ni importa
// buildWhatsAppUrl directo, ver CLAUDE.md > Reglas de WhatsApp: ese es el
// punto central de MessagingProvider (paso 8.1), para que el día que
// exista CloudApiProvider (etapa 13) no haga falta tocar este archivo.
export async function prepareWhatsAppLink(
  personId: string,
  displayName: string,
  phoneE164: string,
  message: string,
): Promise<PreparedWhatsAppLink> {
  const provider = getMessagingProvider();
  const result = await provider.sendToRecipient(
    { personId, displayName, phoneE164 },
    { text: message },
  );
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return { ok: true, url: result.url };
}
