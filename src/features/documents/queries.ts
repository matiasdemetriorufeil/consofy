import "server-only";

import { and, desc, eq, ilike, isNull, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { buildings, documents } from "@/db/schema";

import { DOCUMENT_LIST_PAGE_SIZE } from "./document-list-schema";
import type { DocumentCategory } from "./document-schema";

// `category` es `string` acá, no `DocumentCategory`: la columna es `text`
// en la base (ver src/db/schema/documents.ts) y este listado no vuelve a
// validar contra el enum de aplicación -- el componente que lo muestra
// resuelve la etiqueta con un guard (`isDocumentCategory`) y cae al valor
// crudo si algún día hay una categoría fuera de la lista.
export type DocumentListRow = {
  id: string;
  buildingId: string;
  buildingName: string;
  category: string;
  title: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  visibility: "private" | "residents";
  uploadedBy: string | null;
  createdAt: Date;
};

export type DocumentListFilters = {
  // `null` = "todos los edificios" (selector del header sin elección), no
  // un valor especial -- mismo criterio que `buildingId` en getReminderList.
  buildingId: string | null;
  // `null` = "todas las categorías".
  category: DocumentCategory | null;
  // `null` = sin búsqueda.
  q: string | null;
};

// Condiciones del WHERE, compartidas entre la consulta paginada y la de
// conteo (mismo patrón que `buildTicketInboxConditions`): SIEMPRE filtra
// por organización y excluye lo borrado; los filtros opcionales solo
// AGREGAN condiciones, nunca reemplazan las dos de base.
function buildDocumentListConditions(
  organizationId: string,
  filters: DocumentListFilters,
): SQL[] {
  const conditions: SQL[] = [
    eq(documents.organizationId, organizationId),
    isNull(documents.deletedAt),
  ];
  if (filters.buildingId) {
    conditions.push(eq(documents.buildingId, filters.buildingId));
  }
  if (filters.category) {
    conditions.push(eq(documents.category, filters.category));
  }
  if (filters.q) {
    // ILIKE case-insensitive sobre el título -- el título ya cae al nombre
    // del archivo cuando no se cargó uno explícito (paso 10.1), así que
    // buscar sobre `title` cubre los dos casos. Sin índice trigram nuevo:
    // el volumen de una biblioteca de edificio es un puñado de filas (a
    // diferencia de los cientos de reclamos que motivaron los GIN de la
    // migración 0022). Si la biblioteca crece, un GIN sobre
    // `documents.title` es el mismo movimiento que hizo la bandeja.
    // `%${q}%` sin escapar `%`/`_`, igual que la búsqueda de la bandeja.
    conditions.push(ilike(documents.title, `%${filters.q}%`));
  }
  return conditions;
}

// La consulta central del explorador -- UNA sola vuelta a la base, con el
// JOIN a `buildings` para el nombre y todos los filtros en el mismo WHERE
// (AND entre sí). `count(*) over()` trae el total de la búsqueda completa
// en cada fila devuelta, sin un `SELECT COUNT(*)` aparte -- mismo truco que
// `getTicketInbox` (paso 6.2), con el mismo límite conocido: si el OFFSET
// salta más allá de todas las filas, la consulta devuelve cero filas y
// ningún total -- para ese caso borde está `getDocumentListCount` abajo,
// que el caller usa SOLO cuando ve cero filas en una página > 1.
export async function getDocumentList(
  organizationId: string,
  filters: DocumentListFilters,
  page: number,
): Promise<{ rows: DocumentListRow[]; totalCount: number }> {
  const conditions = buildDocumentListConditions(organizationId, filters);
  const safePage = page > 0 ? page : 1;
  const offset = (safePage - 1) * DOCUMENT_LIST_PAGE_SIZE;

  const rows = await db
    .select({
      id: documents.id,
      buildingId: documents.buildingId,
      buildingName: buildings.name,
      category: documents.category,
      title: documents.title,
      originalFilename: documents.originalFilename,
      mimeType: documents.mimeType,
      sizeBytes: documents.sizeBytes,
      visibility: documents.visibility,
      uploadedBy: documents.uploadedBy,
      createdAt: documents.createdAt,
      totalCount: sql<number>`count(*) over ()`.mapWith(Number),
    })
    .from(documents)
    .innerJoin(
      buildings,
      and(
        eq(buildings.id, documents.buildingId),
        eq(buildings.organizationId, documents.organizationId),
      ),
    )
    .where(and(...conditions))
    // Más reciente primero. `documents.id` como desempate SIEMPRE presente:
    // sin él, dos documentos con el mismo `created_at` al milisegundo
    // (una subida en lote futura) quedarían en orden no determinista entre
    // una página y la siguiente -- Postgres no garantiza estabilidad sola.
    .orderBy(desc(documents.createdAt), desc(documents.id))
    .limit(DOCUMENT_LIST_PAGE_SIZE)
    .offset(offset);

  // Se reconstruye cada fila explícitamente (sin `totalCount`, que viajaba
  // solo para el conteo) -- mismo criterio que getTicketInbox: un `map` con
  // rest destructuring dejaría una variable sin usar.
  return {
    totalCount: rows[0]?.totalCount ?? 0,
    rows: rows.map((row) => ({
      id: row.id,
      buildingId: row.buildingId,
      buildingName: row.buildingName,
      category: row.category,
      title: row.title,
      originalFilename: row.originalFilename,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      visibility: row.visibility,
      uploadedBy: row.uploadedBy,
      createdAt: row.createdAt,
    })),
  };
}

// Conteo real, disparado SOLO en el caso borde de una página fuera de
// rango (ver getDocumentList arriba). No necesita el JOIN a `buildings`:
// ninguna condición del WHERE referencia esa tabla.
export async function getDocumentListCount(
  organizationId: string,
  filters: DocumentListFilters,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(documents)
    .where(and(...buildDocumentListConditions(organizationId, filters)));
  return row?.count ?? 0;
}
