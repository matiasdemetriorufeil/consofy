import "server-only";

import { Resend } from "resend";

import { env } from "@/lib/env";

import type {
  EmailMessage,
  EmailProvider,
  EmailSendResult,
} from "./email-provider";

// Remitente -- dominio de PRUEBA de Resend (`resend.dev`), no un dominio
// propio verificado: el paso 9.5 no pidió comprar/verificar un dominio,
// solo conectar el envío. Con este remitente, Resend entrega SOLO a la
// casilla del dueño de la cuenta (restricción propia de Resend para
// cuentas sin dominio verificado, no algo que este código imponga) -- es
// justamente el motivo por el que la verificación de este paso se hizo
// mirando el dashboard/logs de Resend, no una casilla real (ver el
// reporte). El día que se verifique un dominio propio, este es el único
// lugar que cambia -- ningún caller de sendAdminEmail() se entera.
const FROM_ADDRESS = "Consofy <onboarding@resend.dev>";

let client: Resend | null = null;
function getClient(): Resend {
  // Instanciado perezoso, no al importar el módulo: mismo motivo que
  // `env` ya se valida en su propio módulo (server-only) -- esto evita
  // crear el cliente (y por lo tanto exigir la key) en cualquier import
  // que toque este archivo por transitividad antes de que haga falta de
  // verdad.
  if (!client) {
    client = new Resend(env.RESEND_API_KEY);
  }
  return client;
}

export const resendProvider: EmailProvider = {
  async send(message: EmailMessage): Promise<EmailSendResult> {
    const { data, error } = await getClient().emails.send({
      from: FROM_ADDRESS,
      to: message.to,
      subject: message.subject,
      html: message.html,
    });

    if (error) {
      return { ok: false, error: error.message };
    }
    if (!data) {
      // No debería pasar (Resend devuelve `data` o `error`, nunca los dos
      // ausentes) -- cubierto igual para que el tipo de retorno sea
      // honesto, sin asumir un `data` que TypeScript ya marca opcional.
      return { ok: false, error: "Resend no devolvió confirmación ni error." };
    }
    return { ok: true };
  },
};
