import "server-only";

import { cache } from "react";

import { TICKET_ATTACHMENTS_BUCKET } from "@/features/public-form/ticket-schema";
import { createAdminClient } from "@/lib/supabase/admin";

import { BUILDING_DOCUMENTS_BUCKET } from "./document-schema";
import { resolveStorageQuota, type StorageQuota } from "./storage-quota";

// Uso de Storage del proyecto para el indicador de cuota (paso 10.6).
//
// Los DOS buckets privados compiten por el único límite de 1 GB del plan
// (riesgo R4 del plan): la biblioteca de documentos (`building-documents`,
// paso 10.1) y las fotos/PDF de los reclamos (`ticket-attachments`, paso
// 5.4). Se suman los dos contra ese límite.
const QUOTA_BUCKETS = [BUILDING_DOCUMENTS_BUCKET, TICKET_ATTACHMENTS_BUCKET];

// El SDK de Storage lista hasta 100 entradas por llamada; se pagina con
// offset hasta agotar cada carpeta.
const STORAGE_LIST_PAGE_SIZE = 100;

export type StorageUsageBreakdown = StorageQuota & {
  // La UI muestra solo el total; el desglose por bucket alimenta el tooltip
  // y sirve para verificar que la suma efectivamente cubre los dos buckets.
  perBucket: { bucket: string; bytes: number; objects: number }[];
};

type StorageListEntry = {
  name: string;
  id: string | null;
  metadata: { size?: number } | null;
};

// Recorre un bucket entero y suma el tamaño de cada objeto. Storage no
// expone un "tamaño total del bucket", hay que listar y sumar. El SDK lista
// UNA carpeta por llamada: las entradas sin `id`/`metadata` son subcarpetas
// sintéticas (derivadas del prefijo del nombre del objeto) y hay que bajar
// recursivamente; las hojas traen `metadata.size`. Se paraleliza por
// carpeta para no encadenar decenas de round-trips en serie.
//
// NO se suma `documents.size_bytes` / `ticket_attachments.size_bytes` de la
// base: hay adjuntos huérfanos documentados -- un formulario público
// abandonado deja el archivo subido bajo `pending/` sin ninguna fila que lo
// referencie (ver CLAUDE.md > Fotos y adjuntos del formulario público) --
// que esa suma NO contaría, y filas de seed que apuntan a objetos que no
// existen, que contaría de más. Listar Storage da el número real.
async function sumBucketUsage(
  admin: ReturnType<typeof createAdminClient>,
  bucket: string,
): Promise<{ bucket: string; bytes: number; objects: number }> {
  let bytes = 0;
  let objects = 0;

  async function walk(prefix: string): Promise<void> {
    const subfolders: string[] = [];
    let offset = 0;
    for (;;) {
      const { data, error } = await admin.storage.from(bucket).list(prefix, {
        limit: STORAGE_LIST_PAGE_SIZE,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) {
        throw new Error(
          `No se pudo listar ${bucket}/${prefix}: ${error.message}`,
        );
      }
      const entries = (data ?? []) as StorageListEntry[];
      for (const entry of entries) {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        const isFile = entry.id !== null && entry.metadata != null;
        if (isFile) {
          objects += 1;
          bytes += entry.metadata?.size ?? 0;
        } else {
          subfolders.push(path);
        }
      }
      if (entries.length < STORAGE_LIST_PAGE_SIZE) {
        break;
      }
      offset += STORAGE_LIST_PAGE_SIZE;
    }
    await Promise.all(subfolders.map((folder) => walk(folder)));
  }

  await walk("");
  return { bucket, bytes, objects };
}

// Cálculo EN VIVO -- sin cachear en una tabla ni en un cron (el paso 10.6
// lo deja afuera a propósito: si el cálculo es rápido para el volumen
// actual, no hace falta optimizarlo todavía). `cache()` de React solo
// dedupe llamadas dentro de un mismo request.
//
// Si el fan-out de `list()` llegara a pesar en el volumen real, la
// alternativa más liviana es `SUM((metadata->>'size')::bigint) FROM
// storage.objects` vía Drizzle -- mismo patrón (leer `storage.objects` con
// el rol `postgres`, sin service-role) que `getExistingAttachmentPaths` en
// public-form/storage-objects.ts. Ver el reporte del paso 10.6 para el
// trade-off (acopla al shape interno de `storage.objects`).
export const getStorageUsage = cache(
  async (): Promise<StorageUsageBreakdown> => {
    const admin = createAdminClient();
    const perBucket = await Promise.all(
      QUOTA_BUCKETS.map((bucket) => sumBucketUsage(admin, bucket)),
    );
    const usedBytes = perBucket.reduce((total, b) => total + b.bytes, 0);
    return { ...resolveStorageQuota(usedBytes), perBucket };
  },
);
