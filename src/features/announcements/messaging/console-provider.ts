import type {
  MessagingAttemptResult,
  MessagingMessage,
  MessagingProvider,
  MessagingRecipient,
} from "./messaging-provider";

// Implementación de desarrollo (paso 8.1) -- no abre nada real, imprime el
// destinatario y el mensaje de forma legible. Default razonable para
// cualquier checkout nuevo del proyecto (ver env.ts): nadie debería
// terminar abriendo WhatsApp de verdad solo por no haber configurado
// MESSAGING_PROVIDER todavía.
//
// Sin `import "server-only"` a propósito -- console.log corre igual en
// cliente o servidor, y este archivo no toca nada que sí lo necesite (ni
// `env`, ni la base). Mantenerlo sin la marca es lo que permite testearlo
// con Vitest sin el hook que stubea "server-only" (mismo criterio que
// normalize-ticket-text.ts, paso 7.1).
export const consoleProvider: MessagingProvider = {
  id: "console",
  async sendToRecipient(
    recipient: MessagingRecipient,
    message: MessagingMessage,
  ): Promise<MessagingAttemptResult> {
    console.log(
      [
        "[ConsoleProvider] Simulando envío de WhatsApp",
        `  Para: ${recipient.displayName} (${recipient.phoneE164})`,
        "  Mensaje:",
        message.text
          .split("\n")
          .map((line) => `    ${line}`)
          .join("\n"),
      ].join("\n"),
    );
    return { ok: true, url: null };
  },
};
