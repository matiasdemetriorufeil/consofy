import "server-only";

import { env } from "@/lib/env";

import { buildUrgentTicketAlertEmail } from "../email-content";
import { getAdminEmails } from "./get-admin-emails";
import { getEmailProvider } from "./get-email-provider";

export type SendUrgentTicketAlertEmailInput = {
  organizationId: string;
  buildingName: string;
  ticketId: string;
  ticketTitle: string;
  ticketPublicCode: string;
};

// Alerta inmediata de reclamo urgente (paso 9.5, punto 4) -- llamada DENTRO
// de createTicketAction (public-form/actions.ts), DESPUÉS de que la
// transacción del ticket ya hizo commit, mismo lugar y mismo motivo que
// detectAndFlagSimilarTickets() (paso 7.2): un email que tarda o falla no
// tiene por qué demorar ni arriesgar el alta del reclamo, que ya es un
// hecho consumado para cuando esto corre.
//
// REGLA DURA (pedido explícito del punto 7): esta función NUNCA propaga
// una excepción -- mismo patrón que detectAndFlagSimilarTickets, todo el
// cuerpo adentro de un try/catch que loguea y no re-lanza. Sin un tipo de
// resultado propio (a diferencia de esa función): acá no hay nada que el
// caller necesite decidir según cómo salió -- crear el ticket ya terminó
// antes de que esto se llame, así que no hay una segunda escritura (como
// el `ticket_events` de detectAndFlagSimilarTickets) que dependa de si
// esto funcionó o no.
export async function sendUrgentTicketAlertEmail(
  input: SendUrgentTicketAlertEmailInput,
): Promise<void> {
  try {
    const adminEmails = await getAdminEmails(input.organizationId);
    if (adminEmails.length === 0) {
      // No debería pasar en la práctica (ver el comentario de
      // getAdminEmails), pero no hay a quién mandarle nada -- no es un
      // error de este envío, es una organización sin ningún app_user
      // todavía.
      return;
    }

    const content = buildUrgentTicketAlertEmail({
      buildingName: input.buildingName,
      ticketTitle: input.ticketTitle,
      ticketPublicCode: input.ticketPublicCode,
      ticketUrl: `${env.NEXT_PUBLIC_APP_URL}/panel/tickets/${input.ticketId}`,
    });

    const result = await getEmailProvider().send({
      to: adminEmails,
      subject: content.subject,
      html: content.html,
    });

    if (!result.ok) {
      console.error(
        `[sendUrgentTicketAlertEmail] Resend no pudo enviar el email para el ticket ${input.ticketId}: ${result.error}`,
      );
    }
  } catch (error) {
    console.error(
      `[sendUrgentTicketAlertEmail] Falló el envío del email para el ticket ${input.ticketId}:`,
      error,
    );
  }
}
