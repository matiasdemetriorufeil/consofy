"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { notifications } from "@/db/schema";
import { authorizedAction } from "@/lib/auth";

import {
  getRecentNotifications,
  getUnreadNotificationCount,
  type NotificationCursor,
  type NotificationPage,
  type NotificationRow,
} from "./queries";

// El contador del header lo pinta `layout.tsx` (Server Component) UNA vez
// por navegación completa -- revalidar el LAYOUT (segundo argumento
// "layout", no el default "page") es lo que hace que la próxima vez que el
// admin navegue a cualquier página del panel, ese conteo ya salga
// actualizado de verdad, sin depender de que el estado del cliente
// sobreviva (cerrar la pestaña, abrir el panel de nuevo). El contador que
// se ve MIENTRAS el Popover sigue abierto en la MISMA carga de página lo
// actualiza NotificationBell con el valor que devuelve cada action
// directamente (ver ese componente) -- este revalidate es la otra mitad,
// para cuando no hay ningún estado de cliente vivo.
function revalidateNotificationPaths() {
  revalidatePath("/panel", "layout");
}

export type NotificationCenterData = {
  unreadCount: number;
  notifications: NotificationRow[];
  hasMore: boolean;
};

// Se piden las dos cosas juntas (conteo + primer bloque), no el listado
// solo, a propósito: el conteo que ya tenía pintado el header (paso del
// layout, `getUnreadNotificationCount` en la carga de la página) puede
// haber quedado desactualizado si pasó algo entre esa carga y este click
// (otra pestaña, otro dispositivo) -- se recalculan las dos juntas, en la
// misma invocación, para que el número del badge y el estado leído/no
// leído de cada fila del Popover nunca puedan desincronizarse entre sí.
// Siempre pide el PRIMER bloque (`cursor: null`) -- "cargar más" es
// `loadMoreNotificationsAction`, más abajo, una action aparte porque no
// necesita recalcular `unreadCount` en cada bloque.
export const getNotificationCenterDataAction = authorizedAction(
  async (context): Promise<NotificationCenterData> => {
    const [unreadCount, page] = await Promise.all([
      getUnreadNotificationCount(context.organization.id),
      getRecentNotifications(context.organization.id, null),
    ]);
    return {
      unreadCount,
      notifications: page.notifications,
      hasMore: page.hasMore,
    };
  },
);

// Zod igual para un valor que el propio servidor le dio al cliente en la
// respuesta anterior (la última fila del bloque ya mostrado) -- CLAUDE.md >
// Reglas de seguridad no hace esa excepción: toda entrada de una Server
// Action se valida en el servidor, venga de donde venga.
const notificationCursorSchema = z.object({
  createdAt: z.date(),
  id: z.uuid(),
});

// "Cargar más" (pedido posterior al 9.3 -- reemplaza el tope duro de 20 por
// paginación real, ver CLAUDE.md > Centro de notificaciones). Recibe el
// cursor de la ÚLTIMA fila que el cliente ya tiene pintada y devuelve el
// bloque siguiente -- nunca recalcula `unreadCount` (a diferencia de
// `getNotificationCenterDataAction`): pedir un bloque más viejo no cambia
// cuántas notificaciones hay sin leer, así que no hace falta esa segunda
// consulta acá.
export const loadMoreNotificationsAction = authorizedAction(
  async (context, cursor: NotificationCursor): Promise<NotificationPage> => {
    const parsed = notificationCursorSchema.safeParse(cursor);
    if (!parsed.success) {
      return { notifications: [], hasMore: false };
    }
    return getRecentNotifications(context.organization.id, parsed.data);
  },
);

export type NotificationActionResult = { ok: boolean; unreadCount: number };

// Individual (paso 9.3, punto 3). Filtra por organización Y por
// `read_at IS NULL` en el propio WHERE -- lo segundo no es una validación
// de negocio (releer una notificación ya leída no rompe nada), es para no
// pisar el `read_at` original con un timestamp más nuevo si se clickea dos
// veces (la primera vez real es la que importa conservar).
export const markNotificationReadAction = authorizedAction(
  async (
    context,
    notificationId: string,
  ): Promise<NotificationActionResult> => {
    const parsed = z.uuid().safeParse(notificationId);
    if (parsed.success) {
      await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(notifications.id, parsed.data),
            eq(notifications.organizationId, context.organization.id),
            isNull(notifications.readAt),
            isNull(notifications.deletedAt),
          ),
        );
      revalidateNotificationPaths();
    }

    const unreadCount = await getUnreadNotificationCount(
      context.organization.id,
    );
    return { ok: parsed.success, unreadCount };
  },
);

// "Todas" es literal, no solo las que trajo getRecentNotifications al
// Popover (un bloque de NOTIFICATION_PAGE_SIZE, ver queries.ts) -- un
// UPDATE directo contra la organización entera, no contra una lista de ids
// que el cliente tendría que mandar. Con "cargar más" ya no debería haber
// ninguna no leída fuera de lo que el Popover puede eventualmente mostrar
// (ver CLAUDE.md > Centro de notificaciones), pero este UPDATE nunca
// dependió de eso -- sigue alcanzando a TODA la organización sin importar
// cuántos bloques haya cargado el cliente. Si hubiera 30 no leídas y el
// Popover solo mostrara las primeras 20, "marcar todas como leídas" tiene
// que dejar el contador en 0 igual -- lo contrario (que el botón diga
// "todas" pero deje 10 sin marcar) sería el mismo tipo de texto que miente
// que CLAUDE.md > Voz y escritura pide evitar.
export const markAllNotificationsReadAction = authorizedAction(
  async (context): Promise<NotificationActionResult> => {
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.organizationId, context.organization.id),
          isNull(notifications.readAt),
          isNull(notifications.deletedAt),
        ),
      );

    revalidateNotificationPaths();
    return { ok: true, unreadCount: 0 };
  },
);
