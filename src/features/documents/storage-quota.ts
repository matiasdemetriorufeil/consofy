import { formatFileSize } from "./document-schema";

// Archivo puro (sin `import "server-only"`): la matemática de la cuota y el
// formateo se testean con Vitest sin tocar Supabase -- mismo criterio que
// document-schema.ts. La parte de I/O (listar los buckets y sumar) vive
// aparte en storage-usage.ts, que sí es `server-only`.

// -----------------------------------------------------------------------
// Límite del plan (paso 10.6)
// -----------------------------------------------------------------------
// El plan gratuito de Supabase documenta "1 GB" de Storage para TODO el
// proyecto. Se toma la lectura binaria (1 GiB = 1024^3 bytes) a propósito:
// es un límite un poco más chico que 1000^3, así el aviso del 80% salta un
// pelín antes -- del lado conservador para algo que, si se cruza de verdad,
// hace que Supabase deje de aceptar subidas en todo el proyecto.
//
// Riesgo R4 del plan: `building-documents` (biblioteca de documentos, paso
// 10.1) y `ticket-attachments` (fotos/PDF de reclamos, paso 5.4) compiten
// por este MISMO 1 GB. El indicador suma los dos, no cada uno contra un
// límite inventado.
export const STORAGE_QUOTA_LIMIT_BYTES = 1024 ** 3;

// Etiqueta fija para mostrar el límite ("... de 1 GB"). `formatStorageSize`
// del límite daría "1.00 GB"; el número redondo se lee mejor como
// referencia.
export const STORAGE_QUOTA_LIMIT_LABEL = "1 GB";

// Umbral de aviso. Cruzarlo cambia el estado visual del indicador (color +
// ícono), NO bloquea nada -- el bloqueo de subidas al superar la cuota no
// es parte del paso 10.6 ni lo pide el plan.
export const STORAGE_QUOTA_WARNING_RATIO = 0.8;

export type StorageQuota = {
  usedBytes: number;
  limitBytes: number;
  // usedBytes / limitBytes SIN recortar -- puede pasar de 1 si el proyecto
  // ya superó el límite. La barra de la UI sí se recorta al 100%.
  ratio: number;
  // ratio * 100 redondeado, para el texto ("83%").
  percent: number;
  // ratio >= STORAGE_QUOTA_WARNING_RATIO.
  isWarning: boolean;
};

export function resolveStorageQuota(usedBytes: number): StorageQuota {
  const safeUsed = usedBytes > 0 ? usedBytes : 0;
  const ratio = safeUsed / STORAGE_QUOTA_LIMIT_BYTES;
  const percent = Math.round(ratio * 100);
  return {
    usedBytes: safeUsed,
    limitBytes: STORAGE_QUOTA_LIMIT_BYTES,
    ratio,
    percent,
    // Se basa en `percent` (el número que se muestra), NO en `ratio` crudo:
    // si no, el redondeo deja un hueco -- el texto dice "80%" pero el aviso
    // todavía no está activo porque el ratio real es 0,79999... (pasa con
    // cualquier conteo de bytes entero cerca del umbral). Apenas la
    // pantalla muestra 80%, el aviso está activo.
    isWarning: percent >= STORAGE_QUOTA_WARNING_RATIO * 100,
  };
}

// Reusa `formatFileSize` (paso 10.2: B / KB / MB) y solo le agrega el tramo
// GB, que ese helper no cubre porque está pensado para un archivo suelto
// (tope 10 MB). Acá el total del proyecto sí puede llegar a cientos de MB o
// al GB.
export function formatStorageSize(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) {
    return `${gb.toFixed(2)} GB`;
  }
  return formatFileSize(bytes);
}
