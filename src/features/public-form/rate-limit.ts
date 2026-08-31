import "server-only";

import { and, count, eq, gte } from "drizzle-orm";

import { db } from "@/db";
import { publicFormRateLimitAttempts } from "@/db/schema";

// -----------------------------------------------------------------------
// Por qué Postgres, no memoria de proceso ni Redis
// -----------------------------------------------------------------------
// Mismo razonamiento, palabra por palabra, que login_attempts (paso 3.2) --
// ver src/features/auth/login-rate-limit.ts. Memoria de proceso no sirve en
// Vercel (serverless, cada invocación puede caer en una instancia distinta);
// Redis sería infraestructura nueva para un volumen que Postgres ya cubre
// sin costo (ver CLAUDE.md > Galería pública de adjuntos y el análisis del
// paso 5.11 para el detalle completo).
//
// -----------------------------------------------------------------------
// Umbrales -- por qué estos números, contra casos de uso reales
// -----------------------------------------------------------------------
// El caso que NUNCA puede bloquearse: un vecino real cargando su segundo o
// tercer reclamo del mes (el ejemplo del enunciado: el ascensor que se
// rompe seguido). Esos envíos están separados por DÍAS o SEMANAS -- ninguna
// ventana de minutos/horas los va a ver nunca, sin importar cuán generosa o
// estricta sea. Lo que la ventana sí tiene que tolerar es una sesión real
// de uso normal: un reintento porque el vecino no vio confirmación (falla
// de red, paso 5.5), o dos reclamos DISTINTOS cargados seguidos en la misma
// visita (dos problemas reales, ej. "se rompió el portero" y "gotea el
// caño" un mismo día).
//
// Ventana de 30 minutos (más corta que los 15/20 de login a propósito de lo
// contrario -- ver abajo -- pero elegida más larga que un simple "medio
// minuto entre reintentos" porque una sesión real completando el formulario
// de 4 pasos, con fotos, puede llevar varios minutos por reclamo):
// - TICKET_PHONE: 5 envíos por teléfono cada 30 minutos. Cubre con margen
//   una sesión real (reintento + dos o tres problemas distintos) sin que
//   nadie legítimo lo note; una persona mandando 5+ reclamos con el MISMO
//   teléfono en media hora ya no es un patrón de uso normal, sea troll
//   manual o script.
// - TICKET_IP: 15 envíos por IP cada 30 minutos -- 3x el umbral de
//   teléfono, misma asimetría que login (ahí la relación es 4x), justificada
//   más fuerte todavía acá: una IP compartida en este dominio (el WiFi de
//   un área común, varios vecinos del mismo edificio) es un escenario
//   legítimo mucho más plausible que en login (un puñado de administradores
//   en general no comparte red).
// - UPLOAD_IP: 30 subidas por IP cada 30 minutos -- hasta 5 archivos por
//   reclamo (MAX_TICKET_PHOTOS), así que esto tolera hasta 6 reclamos
//   "llenos" de fotos por IP en la ventana, muy por encima de cualquier uso
//   real de un solo vecino, y generoso para varios vecinos compartiendo
//   una misma IP subiendo fotos a la vez.
//
// No hay umbral de teléfono para subida de adjuntos -- a propósito, ver el
// comentario de la tabla (public-form-rate-limit-attempts.ts): la subida
// puede ocurrir antes de que el teléfono esté siquiera tipeado si el vecino
// navega los pasos del formulario fuera de orden.
const TICKET_SUBMISSION_WINDOW_MINUTES = 30;
const TICKET_SUBMISSION_PHONE_MAX = 5;
const TICKET_SUBMISSION_IP_MAX = 15;

const ATTACHMENT_UPLOAD_WINDOW_MINUTES = 30;
const ATTACHMENT_UPLOAD_IP_MAX = 30;

// Consulta de estado por public_code tipeado a mano (paso 11.1). Esta vía
// es deliberadamente la débil: el código es corto y enumerable a propósito
// (PREFIJO-AÑO-NNNN, ver tickets.public_code) -- decidido y documentado así
// desde el paso 2.4b, NO un bug de este paso. El rate limit es la
// mitigación mínima pedida: hace que barrer el espacio de códigos de un
// edificio (unos cientos de NNNN por año en la práctica) sea lento y
// ruidoso, sin molestar a un vecino real.
//
// Solo por IP (sin teléfono): el vecino que consulta no se identifica,
// solo tipea el código -- mismo caso que attachment_upload. Ventana de 15
// min (alineada con login) y 10 intentos: un vecino que copia y pega su
// código de la pantalla de confirmación o del WhatsApp acierta a la
// primera; 10 en 15 minutos ya es tipeo a ciegas o un script. A ese ritmo,
// probar 300 códigos lleva ~7,5 horas por IP.
const STATUS_LOOKUP_WINDOW_MINUTES = 15;
const STATUS_LOOKUP_IP_MAX = 10;

async function countAttempts(
  kind: "ticket_submission" | "attachment_upload" | "status_lookup",
  column: "ip" | "phone",
  value: string,
  windowMinutes: number,
): Promise<number> {
  const windowStart = new Date(Date.now() - windowMinutes * 60_000);
  const [row] = await db
    .select({ count: count() })
    .from(publicFormRateLimitAttempts)
    .where(
      and(
        eq(publicFormRateLimitAttempts.kind, kind),
        column === "ip"
          ? eq(publicFormRateLimitAttempts.ip, value)
          : eq(publicFormRateLimitAttempts.phone, value),
        gte(publicFormRateLimitAttempts.createdAt, windowStart),
      ),
    );
  return row?.count ?? 0;
}

// Un solo intento se cuenta como uno solo, sin importar si createTicketAction
// lo reintenta internamente por una carrera de teléfono (ver actions.ts) --
// se llama UNA vez por envío real del vecino, antes de intentar crear el
// reclamo, nunca dentro de attemptCreateTicket().
export async function isTicketSubmissionRateLimited(
  phone: string,
  ip: string,
): Promise<boolean> {
  const phoneCount = await countAttempts(
    "ticket_submission",
    "phone",
    phone,
    TICKET_SUBMISSION_WINDOW_MINUTES,
  );
  if (phoneCount >= TICKET_SUBMISSION_PHONE_MAX) {
    return true;
  }
  const ipCount = await countAttempts(
    "ticket_submission",
    "ip",
    ip,
    TICKET_SUBMISSION_WINDOW_MINUTES,
  );
  return ipCount >= TICKET_SUBMISSION_IP_MAX;
}

export async function recordTicketSubmissionAttempt(
  phone: string,
  ip: string,
): Promise<void> {
  await db
    .insert(publicFormRateLimitAttempts)
    .values({ kind: "ticket_submission", phone, ip });
}

// Sin teléfono -- ver el comentario de la tabla sobre por qué la subida de
// adjuntos se limita solo por IP.
export async function isAttachmentUploadRateLimited(
  ip: string,
): Promise<boolean> {
  const ipCount = await countAttempts(
    "attachment_upload",
    "ip",
    ip,
    ATTACHMENT_UPLOAD_WINDOW_MINUTES,
  );
  return ipCount >= ATTACHMENT_UPLOAD_IP_MAX;
}

export async function recordAttachmentUploadAttempt(ip: string): Promise<void> {
  await db
    .insert(publicFormRateLimitAttempts)
    .values({ kind: "attachment_upload", ip, phone: null });
}

// Consulta de estado por public_code (paso 11.1) -- solo por IP, ver el
// comentario de los umbrales arriba. Igual que attachment_upload: se cuenta
// CADA intento (acertado o no), el volumen es la señal.
export async function isStatusLookupRateLimited(ip: string): Promise<boolean> {
  const ipCount = await countAttempts(
    "status_lookup",
    "ip",
    ip,
    STATUS_LOOKUP_WINDOW_MINUTES,
  );
  return ipCount >= STATUS_LOOKUP_IP_MAX;
}

export async function recordStatusLookupAttempt(ip: string): Promise<void> {
  await db
    .insert(publicFormRateLimitAttempts)
    .values({ kind: "status_lookup", ip, phone: null });
}
