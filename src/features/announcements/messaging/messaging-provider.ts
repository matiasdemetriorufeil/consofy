// MessagingProvider (paso 8.1) -- interfaz del flujo de SALIDA (comunicados
// masivos, etapa 8). Deliberadamente AISLADA del flujo de ENTRADA (handoff
// del vecino, etapa 5, format-ticket-message.ts + whatsapp-url.ts) -- ver
// CLAUDE.md > Reglas de WhatsApp: son dos problemas distintos que comparten
// aprendizajes (dominio de la URL, truncado por grafemas), no código de
// orquestación. El flujo de entrada no tiene ni necesita esta interfaz
// (nunca va a cambiar de "proveedor" -- el vecino siempre manda el mensaje
// desde su propio WhatsApp); el de salida sí, porque el plan prevé migrar de
// links manuales (Fase 1, este paso) a la Cloud API de WhatsApp Business
// (etapa 13) sin reescribir la UI que lo consume.
//
// Pensada para lo que los pasos futuros van a necesitar, aunque todavía no
// exista ninguna UI que la use (eso empieza en 8.2):
// - UN destinatario por invocación, nunca un lote -- el flujo real de Fase 1
//   (paso 8.5) es manual: el administrador abre WhatsApp de a uno, no hay
//   envío masivo automático. Un método "enviar a N destinatarios" modelaría
//   una capacidad que Fase 1 no tiene y que CloudApiProvider (etapa 13) SÍ
//   podría tener -- se agrega ahí, no acá, cuando haga falta de verdad.
// - Devuelve una Promise aunque las dos implementaciones de este paso
//   (Console, ManualLink) resuelven de forma síncrona -- CloudApiProvider sí
//   va a necesitar I/O real (una llamada HTTP a la Cloud API). Que el método
//   ya sea async desde ahora evita un cambio de firma (y de todos los call
//   sites) el día que ese proveedor exista.
// - El resultado NO asume cómo se persiste a largo plazo (eso es 8.5/8.6,
//   contra `announcement_recipients` -- ver el comentario de
//   MessagingAttemptResult más abajo para la correspondencia exacta con sus
//   columnas).

// Destinatario ya resuelto: el teléfono es NOT NULL acá a propósito -- un
// destinatario SIN teléfono nunca debería llegar a un MessagingProvider.
// `people.phone_e164` sí es nullable (ver CLAUDE.md > Acceso a datos), pero
// decidir "esta persona no tiene cómo recibir un aviso" es un criterio de
// NEGOCIO de announcements (paso 8.5/8.6: esa fila de
// `announcement_recipients` nace directamente en `delivery_status =
// 'skipped'`, sin pasar por ningún proveedor) -- no algo que la mecánica de
// mensajería deba resolver. Mismo criterio de capas que ya separa
// building-schema.ts (qué es un WhatsApp argentino válido) de
// whatsapp-url.ts (cómo se arma un link con un número ya válido).
export type MessagingRecipient = {
  personId: string;
  displayName: string;
  phoneE164: string;
};

// El texto YA formateado (título + cuerpo del aviso, como sea que 8.2+
// decida combinarlos) -- un MessagingProvider no sabe qué es un "aviso" ni
// arma texto a partir de campos de negocio, mismo aislamiento que ya separa
// formatTicketMessage() (arma el texto) de buildWhatsAppUrl() (arma el link
// con un texto ya armado) en el flujo de entrada.
export type MessagingMessage = {
  text: string;
};

// Resultado de UN intento -- pensado para mapear directo a
// `announcement_recipients` (paso 2.5/7.4-style: la tabla ya existía en el
// esquema original, sin ningún código todavía encima) SIN forzar cómo se
// persiste, que sigue siendo trabajo de 8.5/8.6:
//
// - `{ ok: true, url }`: se pudo preparar el mensaje para este destinatario.
//   `url` es lo que la UI tiene que abrir para que el administrador mande el
//   WhatsApp de verdad (ManualLinkProvider) -- `null` cuando no hay nada que
//   abrir (ConsoleProvider, solo para desarrollo). Importante: esto NO
//   equivale a `delivery_status = 'link_opened'` de la tabla -- ese estado
//   describe que el link YA se abrió de verdad (un hecho del navegador,
//   posterior y separado, mismo criterio que `whatsapp_handoff_opened` en
//   el flujo de entrada, paso 5.9: se registra en un paso aparte, disparado
//   por el click real, nunca asumido de antemano). Lo que este resultado sí
//   cubre es el equivalente de "no falló al prepararse" -- una futura Server
//   Action (8.5) decide si eso alcanza para pasar a 'pending' con el link
//   listo, o si espera la confirmación del click para recién ahí escribir
//   'link_opened'.
// - `{ ok: false, error }`: no se pudo preparar el mensaje (ej. el teléfono
//   quedó sin dígitos utilizables después de normalizarlo, o el texto no se
//   pudo codificar) -- mapea a `delivery_status = 'failed'` +
//   `error_message = error`. Nunca a 'skipped': ese estado, como ya se
//   documentó en MessagingRecipient, se decide ANTES de llegar acá.
export type MessagingAttemptResult =
  { ok: true; url: string | null } | { ok: false; error: string };

// Identificador de instancia (paso 8.1): coincide 1 a 1 con los valores
// válidos de la variable de entorno MESSAGING_PROVIDER (ver
// get-messaging-provider.ts) -- útil para logging/depuración sin tener que
// hacer `instanceof` contra una clase (este proyecto no usa clases de
// servicio, ver el comentario de get-messaging-provider.ts).
export type MessagingProviderId = "console" | "manual_link";

// La interfaz en sí -- un objeto plano (no una clase: este proyecto no
// tiene ningún patrón de clases de servicio, solo funciones y objetos
// simples; las únicas clases existentes son subclases de Error). Cualquier
// componente de UI o Server Action que necesite mandar un mensaje pasa
// SIEMPRE por esta forma, nunca importa `buildWhatsAppUrl` ni ningún detalle
// de WhatsApp directo -- ese es el punto central del paso: el día que
// CloudApiProvider exista (etapa 13), el único archivo nuevo es una tercera
// implementación de esta misma forma, sin tocar ningún caller.
export type MessagingProvider = {
  readonly id: MessagingProviderId;
  sendToRecipient: (
    recipient: MessagingRecipient,
    message: MessagingMessage,
  ) => Promise<MessagingAttemptResult>;
};
