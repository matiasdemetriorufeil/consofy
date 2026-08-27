import "server-only";

import { z } from "zod";

import { publicEnv } from "./env.public";

// REGLA: una variable se agrega a este esquema en el mismo paso en que algún
// código empieza a leerla, nunca antes. Hoy lo leen src/db/index.ts
// (DATABASE_URL), src/features/buildings/public-link.ts
// (NEXT_PUBLIC_APP_URL, paso 4.6), src/lib/supabase/admin.ts
// (SUPABASE_SERVICE_ROLE_KEY, paso 5.10: la única forma de generar URLs
// firmadas para el bucket privado de adjuntos, ver CLAUDE.md > Reglas de
// entorno sobre por qué esta clave se usa lo menos posible),
// src/features/announcements/messaging/get-messaging-provider.ts
// (MESSAGING_PROVIDER, paso 8.1 -- el momento en que por fin algo la
// importa de verdad, después de que esta misma regla bloqueó agregarla
// antes de tiempo), src/features/notifications/email/resend-provider.ts
// (RESEND_API_KEY, paso 9.5) y src/app/api/cron/daily/route.ts
// (CRON_SECRET, paso 9.6). Validar variables que nada consume obliga a
// rellenarlas con dummies para poder probar cualquier otra cosa, y eso
// invalida la validación -- no repitas ese error con la próxima variable
// nueva.
//
// RESEND_API_KEY: sin `.default(...)` a propósito, a diferencia de
// MESSAGING_PROVIDER -- no hay un "modo seguro" tipo `console` para
// email (mandar de verdad es la única función de este proveedor); dejar
// que la app arranque sin la key solo pospondría el error hasta el
// primer envío real, en vez de avisar al arrancar. El paso 9.5 la agrega
// solo cuando ya está confirmada en `.env.local` -- ver CLAUDE.md >
// Envío de emails, "cuenta creada a mano, como las de la etapa 0".
//
// CRON_SECRET: mismo criterio que RESEND_API_KEY -- sin default, la
// única función de esta variable es autorizar el endpoint del cron
// (paso 9.6), un valor vacío o ausente no tiene un "modo seguro"
// razonable (dejaría el endpoint sin protección real). A diferencia de
// RESEND_API_KEY (una cuenta externa que hay que crear a mano), este
// valor no corresponde a ningún servicio de terceros -- es un secreto
// compartido arbitrario entre esta app y el workflow de GitHub Actions
// que la llama, así que se generó acá mismo (no hace falta "crear una
// cuenta" para esto). Lo que SÍ queda pendiente de un paso manual, fuera
// del repo -- ver CLAUDE.md > Cron diario: cargar el MISMO valor como
// secret del repositorio en GitHub (Settings → Secrets and variables →
// Actions) y como variable de entorno en Vercel -- eso no lo puede hacer
// Claude Code solo, señalado en el reporte del paso, mismo criterio que
// Resend.
//
// MESSAGING_PROVIDER: "console" | "manual_link" -- NO incluye "cloud_api"
// todavía. CloudApiProvider es etapa 13, ni siquiera existe un stub (pedido
// explícito del paso 8.1) -- aceptar ese valor acá haría que la variable
// "valide" pero el factory no tuviera ninguna implementación real que
// devolver, un fallo diferido y confuso en vez de un error claro al
// arrancar. `.default("console")`: sin esto, cualquier checkout que no
// haya actualizado su `.env.local` todavía (la variable es nueva en este
// paso) dejaría de arrancar la app -- "console" es el default seguro
// porque no abre nada real, solo imprime en la terminal.
//
// NEXT_PUBLIC_APP_URL vive ACÁ (esquema de servidor) y no en
// src/lib/env.public.ts a propósito: el enlace público del edificio se arma
// siempre en el servidor (Server Component / Route Handler, nunca en
// código de navegador) y se le pasa a los componentes cliente ya armado
// como string -- no hace falta que el navegador lea esta variable por su
// cuenta. El prefijo NEXT_PUBLIC_ del nombre viene de .env.example (así se
// llama la URL pública base de la app, más allá de quién la lea); ese
// prefijo solo cambia algo para el bundling de Next.js cuando la
// referencia literal `process.env.NEXT_PUBLIC_*` vive en un archivo que
// termina en el bundle del cliente, que no es el caso acá.
//
// Las demás NEXT_PUBLIC_* (Supabase) siguen en src/lib/env.public.ts, un
// schema aparte sin "server-only" (este archivo sí lo tiene), porque
// src/lib/supabase/client.ts corre en el navegador y necesita leerlas ahí.
//
// MIGRATION_DATABASE_URL no vive acá a propósito: la usa únicamente
// drizzle.config.ts (que la lee directo de process.env, ver ese archivo). No
// es una credencial que la app en runtime necesite para arrancar.

const schema = z.object({
  DATABASE_URL: z.url(),
  NEXT_PUBLIC_APP_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  MESSAGING_PROVIDER: z.enum(["console", "manual_link"]).default("console"),
  RESEND_API_KEY: z.string().min(1),
  CRON_SECRET: z.string().min(1),
});

// -----------------------------------------------------------------------
// Chequeo de consistencia entre proyectos de Supabase (incidente del
// 13-19/08 de 2026, ver CLAUDE.md > Separación dev/producción para el
// relato completo) -- DATABASE_URL y NEXT_PUBLIC_SUPABASE_URL tienen que
// ser SIEMPRE del mismo proyecto de Supabase. Que no lo sean es más
// peligroso que apuntar todo a producción a propósito: la app arranca
// normal, el login funciona (contra un proyecto), y cada query de Drizzle
// va a otro -- nada avisa que algo está mal hasta que alguien nota datos
// donde no deberían estar. Esto pasó de verdad, tres veces en cinco días,
// sin que nadie lo notara, corriendo `next build`/`next start` en una
// máquina que tenía `.env.production-secrets.local` (antes
// `.env.production.local`) de una tarea anterior con drizzle-kit -- ver el
// renombre de ese archivo, la otra mitad de esta protección.
//
// Extrae el "project ref" (el identificador del proyecto en la URL, ej.
// "ytvhanvwkmvyqjeoysab") de los dos formatos de URL de Postgres que
// Supabase usa (pooler: `postgres.<ref>@...`; conexión directa:
// `@db.<ref>.supabase.co`). Si el formato no matchea ninguno de los dos
// (una URL de Postgres que no es de Supabase, en un entorno de prueba
// distinto), devuelve null -- el chequeo de abajo no bloquea nada que no
// pueda comparar con certeza.
function extractSupabaseProjectRefFromDatabaseUrl(url: string): string | null {
  const poolerMatch = url.match(/postgres\.([a-z0-9]+):/);
  if (poolerMatch) {
    return poolerMatch[1]!;
  }
  const directMatch = url.match(/@db\.([a-z0-9]+)\.supabase\.co/);
  return directMatch ? directMatch[1]! : null;
}

function extractSupabaseProjectRefFromApiUrl(url: string): string | null {
  const match = url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/);
  return match ? match[1]! : null;
}

// Mensaje pensado para alguien que NO es programador -- si esto llega a
// saltar alguna vez (ej. una variable mal pegada en el panel de Vercel), lo
// primero que va a ver es este texto, no un stack trace. Explica qué pasó,
// por qué importa, y qué hacer -- sin jerga ("project ref", "pooler") que
// solo alguien que ya conoce el proyecto entendería.
function assertConsistentSupabaseProject(databaseUrl: string): void {
  const dbRef = extractSupabaseProjectRefFromDatabaseUrl(databaseUrl);
  const apiRef = extractSupabaseProjectRefFromApiUrl(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
  );

  if (!dbRef || !apiRef) {
    return;
  }

  if (dbRef !== apiRef) {
    throw new Error(
      "La aplicación detectó una configuración peligrosa y se detuvo antes de arrancar.\n\n" +
        `La conexión a la base de datos y el sistema de acceso de usuarios apuntan a dos proyectos distintos (uno es "${dbRef}", el otro es "${apiRef}") -- deberían ser siempre el mismo. Si esto sigue así, la aplicación puede leer o escribir datos en el lugar equivocado sin ningún aviso.\n\n` +
        "Qué hacer: revisá qué archivo de configuración se está usando (.env.local para desarrollo, .env.production-secrets.local para producción, o las variables cargadas en el panel de Vercel) y corregilo para que los dos apunten al mismo proyecto antes de volver a intentar.",
    );
  }
}

function parseEnv() {
  if (process.env.SKIP_ENV_VALIDATION === "true") {
    // Para CI o builds de análisis que no van a ejecutar la app de verdad
    // (ej: un build que solo corre para chequear tipos, sin acceso a
    // secretos). Nunca en runtime: saltear esto en producción hace arrancar
    // la app sin haber validado nada.
    return process.env as unknown as z.infer<typeof schema>;
  }

  const parsed = schema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    // Zod aplica .default("console") solo cuando la clave está AUSENTE del
    // objeto, no cuando es "" -- un .env.local con la línea
    // "MESSAGING_PROVIDER=" (valor vacío, tal como queda en .env.example)
    // deja process.env.MESSAGING_PROVIDER === "", que fallaría el enum en
    // vez de caer al default. `|| undefined` convierte ese vacío en
    // ausencia real, para que sí dispare el default.
    MESSAGING_PROVIDER: process.env.MESSAGING_PROVIDER || undefined,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
  });

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `Variables de entorno inválidas o faltantes. Revisá .env.local contra .env.example:\n${details}`,
    );
  }

  assertConsistentSupabaseProject(parsed.data.DATABASE_URL);

  return parsed.data;
}

export const env = parseEnv();
