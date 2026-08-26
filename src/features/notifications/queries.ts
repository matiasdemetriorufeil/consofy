import "server-only";

import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { notifications } from "@/db/schema";

import type { NotificationType } from "./notification-type";

export type NotificationRow = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
};

// Tamaño de cada bloque del centro de notificaciones (paso 9.3, ajustado en
// un pedido posterior: "cargar más" en vez de un tope duro -- ver CLAUDE.md >
// Centro de notificaciones para las tres opciones planteadas y por qué se
// eligió esta, decisión tomada con la persona, no propia). Sigue siendo 20 --
// el número en sí nunca fue el problema, lo que faltaba era una forma de
// pedir el bloque siguiente.
export const NOTIFICATION_PAGE_SIZE = 20;

// Cursor de paginación -- keyset, no OFFSET. La bandeja de reclamos (paso
// 6.2) SÍ usa OFFSET/página numerada, pero ahí cada página es una URL
// completa, bookmarkeable, recargada de cero (`?page=3`). Acá "cargar más"
// vive DENTRO de un Popover que queda abierto un rato, y `notifications` es
// una tabla que va a recibir INSERTs en cualquier momento en cuanto exista
// un generador real (etapa 9.4) -- con OFFSET, una fila nueva que se inserta
// arriba de todo mientras el Popover sigue abierto corre el OFFSET un lugar
// y duplica o salta una fila del bloque siguiente. Keyset (pedir "lo que
// sigue después de esta fecha+id") no tiene ese problema: el corte es un
// valor real de la última fila ya mostrada, no una posición numérica que
// se mueve.
export type NotificationCursor = { createdAt: Date; id: string };

export type NotificationPage = {
  notifications: NotificationRow[];
  hasMore: boolean;
};

// Notificaciones NO tiene `building_id` -- a diferencia de reminders/
// tickets/announcements, es una entidad de ORGANIZACIÓN, no de edificio
// (ver el esquema real, `src/db/schema/notifications.ts`, verificado antes
// de escribir esta consulta). El selector de edificio del header NO filtra
// nada acá -- mismo criterio que Edificios/Configuración (CLAUDE.md >
// Selector de edificio activo, "no es válida en las secciones de
// organización"), aplicado por primera vez a un widget del header en vez
// de a una sección completa de navegación.
export async function getUnreadNotificationCount(
  organizationId: string,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(notifications)
    .where(
      and(
        eq(notifications.organizationId, organizationId),
        isNull(notifications.readAt),
        isNull(notifications.deletedAt),
      ),
    );

  return row?.count ?? 0;
}

// Las más recientes primero (pedido explícito, punto 2), leídas y no
// leídas mezcladas -- la distinción es visual (ver NotificationBell), no
// un filtro de esta consulta: si solo trajera las no leídas, no habría
// nada que "distinguir" en la UI.
//
// `cursor` es `null` para el PRIMER bloque (al abrir el Popover) -- para
// los siguientes ("Cargar más"), es `{createdAt, id}` de la ÚLTIMA fila ya
// mostrada, y la condición pide filas estrictamente MÁS VIEJAS que esa en
// el mismo orden total que ya define el `ORDER BY`
// (`created_at < cursor.createdAt`, o empate en `created_at` con
// `id < cursor.id`) -- el desempate por `id` importa porque `created_at`
// no es único (dos notificaciones pueden crearse en el mismo milisegundo;
// sin desempate, una fila con timestamp empatado justo en el borde del
// cursor podría faltar o repetirse entre bloques).
//
// `LIMIT NOTIFICATION_PAGE_SIZE + 1`, no `NOTIFICATION_PAGE_SIZE` a secas
// -- mismo patrón ya usado en el proyecto para "hay más de N" sin un COUNT
// aparte (ver `BULK_SELECTION_MAX` en tickets/queries.ts, paso 6.5): pedir
// una fila de más permite distinguir "quedan exactamente 20" de "quedan
// más de 20" con la misma consulta; la fila 21, si llegó, nunca se
// devuelve, solo se usa para setear `hasMore`.
export async function getRecentNotifications(
  organizationId: string,
  cursor: NotificationCursor | null,
): Promise<NotificationPage> {
  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      title: notifications.title,
      body: notifications.body,
      link: notifications.link,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(
      and(
        eq(notifications.organizationId, organizationId),
        isNull(notifications.deletedAt),
        cursor
          ? or(
              lt(notifications.createdAt, cursor.createdAt),
              and(
                eq(notifications.createdAt, cursor.createdAt),
                lt(notifications.id, cursor.id),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(NOTIFICATION_PAGE_SIZE + 1);

  const hasMore = rows.length > NOTIFICATION_PAGE_SIZE;
  return {
    notifications: hasMore ? rows.slice(0, NOTIFICATION_PAGE_SIZE) : rows,
    hasMore,
  };
}
