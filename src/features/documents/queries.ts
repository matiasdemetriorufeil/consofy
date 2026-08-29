import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { buildings, documents } from "@/db/schema";

// `category` es `string` acá, no `DocumentCategory`: la columna es `text`
// en la base (ver src/db/schema/documents.ts) y este listado no vuelve a
// validar contra el enum de aplicación -- el componente que lo muestra
// resuelve la etiqueta con un guard (`isDocumentCategory`) y cae al valor
// crudo si algún día hay una categoría fuera de la lista.
export type DocumentRow = {
  id: string;
  buildingId: string;
  buildingName: string;
  category: string;
  title: string;
  originalFilename: string;
  sizeBytes: number;
  createdAt: Date;
};

// Mismo patrón de organización que el resto del proyecto (CLAUDE.md >
// Acceso a datos): `organizationId` primero y obligatorio, filtro SIEMPRE
// en el WHERE, `deleted_at IS NULL` siempre. `buildingId` segundo,
// OPCIONAL -- `null` es "todos los edificios" (la vista agregada del
// selector del header), no un valor especial.
//
// Este listado es deliberadamente mínimo -- es solo la confirmación visual
// de que la subida (paso 10.1) llegó. El explorador de verdad (filtros,
// descarga con URLs firmadas, versiones) es el paso 10.2 en adelante. Sin
// paginación: la biblioteca de un edificio administrativo es un puñado de
// archivos, mismo orden de magnitud que sus recordatorios (ver
// getReminderList).
export async function getDocumentsForBuilding(
  organizationId: string,
  buildingId: string | null,
): Promise<DocumentRow[]> {
  return db
    .select({
      id: documents.id,
      buildingId: documents.buildingId,
      buildingName: buildings.name,
      category: documents.category,
      title: documents.title,
      originalFilename: documents.originalFilename,
      sizeBytes: documents.sizeBytes,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .innerJoin(buildings, eq(buildings.id, documents.buildingId))
    .where(
      and(
        eq(documents.organizationId, organizationId),
        buildingId ? eq(documents.buildingId, buildingId) : undefined,
        isNull(documents.deletedAt),
      ),
    )
    .orderBy(desc(documents.createdAt));
}
