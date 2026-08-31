import { HardDrive, TriangleAlert } from "lucide-react";

import { TICKET_ATTACHMENTS_BUCKET } from "@/features/public-form/ticket-schema";

import { BUILDING_DOCUMENTS_BUCKET } from "../document-schema";
import {
  formatStorageSize,
  STORAGE_QUOTA_LIMIT_LABEL,
  type StorageQuota,
} from "../storage-quota";

// Indicador de cuota de Storage (paso 10.6) -- barra fina + texto
// "X de 1 GB (Y%)", arriba del explorador. No intrusivo: no es un modal ni
// bloquea la pantalla, y el cálculo es de solo lectura (no frena subidas al
// pasar el límite -- eso no es parte de este paso).
//
// Server Component puro: el dato ya viene calculado desde la page
// (`getStorageUsage`), acá solo se dibuja. Al cruzar el 80% (`isWarning`)
// cambia de color (primary -> `alta`, el ámbar semántico del sistema) y el
// ícono pasa a la advertencia, para que se note sin leer el número.
//
// No reusa `<Progress>` (src/components/ui/progress.tsx): ese es un Client
// Component con el color del relleno fijo (`bg-primary`), y esta barra es
// markup estático de servidor que necesita cambiar de color según el
// umbral. Dos `<div>` con un `width` en línea es lo mínimo.
export function StorageQuotaIndicator({
  quota,
  perBucket,
}: {
  quota: StorageQuota;
  perBucket: { bucket: string; bytes: number; objects: number }[];
}) {
  const barPercent = Math.min(100, Math.max(0, quota.ratio * 100));
  const breakdownTitle = perBucket
    .map((b) => `${bucketLabel(b.bucket)}: ${formatStorageSize(b.bytes)}`)
    .join(" · ");

  return (
    <section
      aria-label="Espacio de almacenamiento del proyecto"
      className="border-border bg-surface flex flex-col gap-1.5 rounded-lg border p-3"
    >
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-ink-muted inline-flex items-center gap-1.5">
          {quota.isWarning ? (
            <TriangleAlert aria-hidden="true" className="text-alta size-4" />
          ) : (
            <HardDrive aria-hidden="true" className="size-4" />
          )}
          Almacenamiento del proyecto
        </span>
        <span
          className={
            quota.isWarning ? "text-alta font-medium" : "text-ink font-medium"
          }
        >
          {formatStorageSize(quota.usedBytes)} de {STORAGE_QUOTA_LIMIT_LABEL} (
          {quota.percent}%)
        </span>
      </div>

      <div
        className="bg-border h-1.5 w-full overflow-hidden rounded-full"
        title={breakdownTitle}
      >
        <div
          className={`h-full rounded-full ${
            quota.isWarning ? "bg-alta" : "bg-primary"
          }`}
          style={{ width: `${barPercent}%` }}
        />
      </div>

      <p className="text-ink-muted text-xs">
        {quota.isWarning
          ? `Estás usando el ${quota.percent}% del espacio disponible. `
          : ""}
        Incluye los documentos de la biblioteca y las fotos de los reclamos --
        es el límite de todo el proyecto en Supabase, no solo de esta sección.
      </p>
    </section>
  );
}

function bucketLabel(bucket: string): string {
  if (bucket === BUILDING_DOCUMENTS_BUCKET) {
    return "Documentos";
  }
  if (bucket === TICKET_ATTACHMENTS_BUCKET) {
    return "Fotos de reclamos";
  }
  return bucket;
}
