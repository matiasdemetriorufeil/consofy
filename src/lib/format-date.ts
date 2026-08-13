import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

// Tiempo relativo ("hace 2 días"): es una duración pura entre dos instantes
// (Date.now() y `date`), no depende de en qué zona horaria se MUESTRE --
// por eso no recibe timezone. locale "es" de date-fns ya da la forma
// correcta en español rioplatense para esto (no hay voseo que aplicar acá,
// no es una orden dirigida al usuario -- ver CLAUDE.md > Voz y escritura).
export function formatRelativeDate(date: Date): string {
  return formatDistanceToNow(date, { locale: es, addSuffix: true });
}

// Fecha exacta, SIEMPRE en la zona horaria de la organización -- nunca UTC
// (el dato crudo en la base) ni la del navegador de quien mira la pantalla
// (que puede no coincidir con la del edificio real). `Intl.DateTimeFormat`
// con `timeZone` hace la conversión sin depender de una librería aparte
// (no hace falta date-fns-tz): Node y los navegadores ya soportan IANA
// timezones de forma nativa.
export function formatExactDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: timezone,
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);
}
