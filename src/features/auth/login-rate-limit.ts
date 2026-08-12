import "server-only";

import { and, count, eq, gte } from "drizzle-orm";
import { headers } from "next/headers";

import { db } from "@/db";
import { loginAttempts } from "@/db/schema";

// -----------------------------------------------------------------------
// Por qué una tabla de Postgres y no memoria del proceso ni Redis
// -----------------------------------------------------------------------
// Memoria del proceso: descartada. En Vercel (serverless) cada invocación
// puede caer en una instancia distinta, así que un contador en una
// variable no se comparte entre requests -- alguien podría reintentar y,
// con suerte, pegarle a una instancia "fresca" cada vez, sin límite real.
// Funcionaría en un servidor único de proceso persistente, pero no es el
// deploy target de este proyecto (ver CLAUDE.md > Acceso a datos, sobre
// DATABASE_URL y el pooler de transacciones en Vercel).
//
// Redis/servicio externo: descartado por el enunciado (no hay). Agregar
// una dependencia nueva de infraestructura para esto sería
// desproporcionado -- Postgres ya está ahí, ya lo paga el proyecto, y el
// volumen de intentos de login (un puñado de administradores) es
// insignificante para una tabla más.
//
// Postgres (esta tabla): funciona igual sin importar en qué instancia
// serverless caiga cada request, porque todas pegan a la misma base. El
// costo real es una escritura + dos lecturas por intento de login -- nada
// comparado con el volumen de esta app.
//
// -----------------------------------------------------------------------
// Por qué esto hace falta ADEMÁS de lo que ya trae Supabase Auth
// -----------------------------------------------------------------------
// Verificado contra la documentación oficial de rate limits de Supabase
// (supabase.com/docs/guides/auth/rate-limits), no asumido: la tabla de
// límites por default NO tiene una fila dedicada a sign-in con password.
// Lo más cercano es "/auth/v1/token, limitado por IP, 1800 requests por
// hora" (etiquetado ahí como refresh de tokens, pero es el mismo path que
// usa el login por password). Dos problemas para nuestro caso:
//   1. 1800/hora por IP es no realista de bajo para frenar un ataque de
//      fuerza bruta dirigido a UNA cuenta -- son 30 intentos por minuto
//      sostenidos.
//   2. Es puramente por IP: no existe ningún límite nativo por cuenta/
//      email. Un atacante repartiendo intentos entre varias IPs (o
//      probando contraseñas contra un email puntual desde una sola IP
//      dentro de ese límite tan alto) no encuentra ninguna fricción
//      nativa.
// Por eso el límite propio de acá es la defensa real contra fuerza bruta
// dirigida a una cuenta, no un duplicado de algo que Supabase ya cubre.
const EMAIL_WINDOW_MINUTES = 15;
const EMAIL_MAX_FAILED_ATTEMPTS = 5;
const IP_WINDOW_MINUTES = 15;
const IP_MAX_FAILED_ATTEMPTS = 20; // más laxo: una IP compartida (oficina, NAT) no debe trabar a todos por el error de uno.

export async function isRateLimited(
  email: string,
  ip: string,
): Promise<boolean> {
  const emailWindowStart = new Date(Date.now() - EMAIL_WINDOW_MINUTES * 60_000);
  const [emailFailures] = await db
    .select({ count: count() })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.email, email),
        eq(loginAttempts.succeeded, false),
        gte(loginAttempts.createdAt, emailWindowStart),
      ),
    );
  if ((emailFailures?.count ?? 0) >= EMAIL_MAX_FAILED_ATTEMPTS) {
    return true;
  }

  const ipWindowStart = new Date(Date.now() - IP_WINDOW_MINUTES * 60_000);
  const [ipFailures] = await db
    .select({ count: count() })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.ip, ip),
        eq(loginAttempts.succeeded, false),
        gte(loginAttempts.createdAt, ipWindowStart),
      ),
    );
  return (ipFailures?.count ?? 0) >= IP_MAX_FAILED_ATTEMPTS;
}

export async function recordLoginAttempt(
  email: string,
  ip: string,
  succeeded: boolean,
) {
  await db.insert(loginAttempts).values({ email, ip, succeeded });
}

// x-forwarded-for/x-real-ip: los que setea el proxy de Vercel delante de la
// app -- no hay forma de conocer la IP real del cliente en Node sin pasar
// por estos headers en un deploy serverless. En desarrollo local ninguno
// de los dos suele venir seteado, de ahí el fallback.
export async function getClientIp(): Promise<string> {
  const headersList = await headers();
  const forwardedFor = headersList.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]!.trim();
  }
  return headersList.get("x-real-ip") ?? "unknown";
}
