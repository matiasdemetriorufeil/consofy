import "server-only";

import { env } from "@/lib/env";

import { consoleProvider } from "./console-provider";
import { manualLinkProvider } from "./manual-link-provider";
import type { MessagingProvider } from "./messaging-provider";

// Selección de implementación por variable de entorno (paso 8.1) --
// MESSAGING_PROVIDER, validada en src/lib/env.ts. Único punto del proyecto
// que decide QUÉ implementación de MessagingProvider usar; todo lo demás
// (una futura Server Action del 8.5, un componente de UI) llama a
// getMessagingProvider() y programa contra la interfaz, nunca importa
// consoleProvider/manualLinkProvider directo -- eso es lo que hace posible
// que agregar CloudApiProvider en la etapa 13 sea sumar un `case` acá, sin
// tocar ningún caller.
//
// Objeto plano devuelto directo (no una clase, ver el comentario de
// messaging-provider.ts) -- `env.MESSAGING_PROVIDER` ya es exhaustivo sobre
// los dos valores reales gracias al enum de Zod, así que TypeScript puede
// chequear el switch sin una rama "default" -- si alguna vez se agrega un
// tercer valor al enum sin agregar su `case` acá, esto deja de compilar en
// vez de fallar en silencio en runtime.
export function getMessagingProvider(): MessagingProvider {
  switch (env.MESSAGING_PROVIDER) {
    case "console":
      return consoleProvider;
    case "manual_link":
      return manualLinkProvider;
  }
}
