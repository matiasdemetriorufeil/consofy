"use client";

import { Bell } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { usePanelUser } from "@/features/auth/panel-user-context";

import {
  getNotificationCenterDataAction,
  loadMoreNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "../actions";
import type { NotificationRow } from "../queries";
import { NotificationItem } from "./notification-item";

// Campana del header (paso 9.3) -- reemplaza el botón deshabilitado
// "espacio reservado para la etapa 9" de site-header.tsx (paso 3.4).
//
// `initialUnreadCount` viene del layout (Server Component, cache() de
// requireUser ya resuelto ahí) -- se ve de inmediato en CUALQUIER página
// del panel, sin esperar a que se abra el Popover. El LISTADO, en cambio,
// se pide recién al abrir (`getNotificationCenterDataAction`, que además
// devuelve un conteo fresco -- ver el comentario de esa action): traerlo
// en el layout de entrada cargaría datos que la mayoría de las cargas de
// página no van a usar nunca, mismo criterio que ya aplica
// getUnitDependencyCounts (paso 4.3) al diálogo de baja de una unidad.
export function NotificationBell({
  initialUnreadCount,
}: {
  initialUnreadCount: number;
}) {
  const { organization } = usePanelUser();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [notifications, setNotifications] = useState<NotificationRow[] | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  // "Cargar más" (reemplaza el tope duro de 20 del paso 9.3, ver CLAUDE.md >
  // Centro de notificaciones -- decisión tomada con la persona, no propia).
  // `hasMore` es lo que decide si el botón se muestra; `isLoadingMore` es
  // SU PROPIO estado de carga, separado de `isLoading` (el de la apertura
  // inicial) -- pedir el bloque siguiente no debe hacer parpadear la lista
  // entera a "Cargando…", solo el pie con el botón.
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Guard de secuencia -- mismo patrón que la condición de carrera ya
  // encontrada y corregida en el contador en vivo del constructor de
  // segmentos de comunicados (paso 8.2, CLAUDE.md > Constructor de
  // segmentos para comunicados): tres acciones distintas de este
  // componente (abrir el Popover, marcar una, marcar todas) pueden quedar
  // en vuelo al mismo tiempo, y nada garantiza que resuelvan en el orden
  // en que se lanzaron. Sin este guard, una respuesta VIEJA (ej. el
  // listado inicial al abrir) que llega tarde puede pisar el resultado de
  // una acción más nueva (ej. "marcar una leída") con datos ya obsoletos.
  // Cada acción se identifica con un número creciente; al resolver, solo
  // aplica su resultado si sigue siendo la más reciente lanzada.
  const latestRequestId = useRef(0);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    // Se recarga en CADA apertura, no solo la primera -- el Popover puede
    // quedar abierto un buen rato en la cabeza de alguien que dejó la
    // pestaña con foco en otro lado; reabrirlo es la señal de "quiero ver
    // el estado real ahora", no de "seguí mostrándome lo de hace rato".
    if (nextOpen) {
      const requestId = ++latestRequestId.current;
      setIsLoading(true);
      startTransition(async () => {
        const data = await getNotificationCenterDataAction();
        if (requestId !== latestRequestId.current) {
          return;
        }
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
        setHasMore(data.hasMore);
        setIsLoading(false);
      });
    }
  }

  // Pide el bloque siguiente con el cursor de la ÚLTIMA fila ya cargada
  // (`created_at`+`id`, ver el comentario de getRecentNotifications en
  // queries.ts) y lo agrega al final de la lista que ya está en pantalla --
  // nunca reemplaza lo que ya se ve, ni cierra ni recarga el Popover.
  function handleLoadMore() {
    const last = notifications?.at(-1);
    if (!last) {
      return;
    }
    const requestId = ++latestRequestId.current;
    setIsLoadingMore(true);
    startTransition(async () => {
      const page = await loadMoreNotificationsAction({
        createdAt: last.createdAt,
        id: last.id,
      });
      if (requestId !== latestRequestId.current) {
        return;
      }
      setNotifications((prev) => [...(prev ?? []), ...page.notifications]);
      setHasMore(page.hasMore);
      setIsLoadingMore(false);
    });
  }

  function handleMarkOneRead(id: string) {
    const requestId = ++latestRequestId.current;
    startTransition(async () => {
      const result = await markNotificationReadAction(id);
      if (requestId !== latestRequestId.current) {
        return;
      }
      setUnreadCount(result.unreadCount);
      if (result.ok) {
        setNotifications(
          (prev) =>
            prev?.map((n) =>
              n.id === id ? { ...n, readAt: new Date() } : n,
            ) ?? prev,
        );
      }
    });
  }

  function handleMarkAllRead() {
    const requestId = ++latestRequestId.current;
    startTransition(async () => {
      const result = await markAllNotificationsReadAction();
      if (requestId !== latestRequestId.current) {
        return;
      }
      setUnreadCount(result.unreadCount);
      setNotifications(
        (prev) =>
          prev?.map((n) => ({ ...n, readAt: n.readAt ?? new Date() })) ?? prev,
      );
    });
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            unreadCount > 0
              ? `Notificaciones, ${unreadCount} sin leer`
              : "Notificaciones"
          }
        >
          <Bell aria-hidden="true" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-4 min-w-4 justify-center rounded-full px-1 text-[10px] tabular-nums"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-0 p-0 sm:w-96">
        <div className="border-border flex items-center justify-between gap-2 border-b p-3">
          <p className="text-ink font-medium">Notificaciones</p>
          {unreadCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={handleMarkAllRead}
            >
              Marcar todas como leídas
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {isLoading || notifications === null ? (
            <p className="text-ink-muted p-4 text-center text-sm">Cargando…</p>
          ) : notifications.length === 0 ? (
            <p className="text-ink-muted p-4 text-center text-sm">
              Todavía no tenés notificaciones.
            </p>
          ) : (
            <ul className="divide-border divide-y">
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  timezone={organization.timezone}
                  isPending={isPending}
                  onNavigate={() => {
                    // Encontrado en la práctica probando este paso, con
                    // evidencia real (logs + SQL), no solo sospechado: acá
                    // ANTES se disparaba también `markNotificationReadAction`
                    // al hacer click en una notificación con link (marcado
                    // automático al navegar). Se sacó -- rompía la
                    // navegación de Next.js de verdad. La causa: esa action
                    // llama `revalidatePath("/panel", "layout")` (ver
                    // actions.ts), y Next.js trata la respuesta de una
                    // Server Action que revalida como una señal de "refrescá
                    // la ruta actual" para el router del cliente -- si esa
                    // señal llega mientras el <Link> todavía tiene una
                    // navegación EN CURSO hacia otra ruta, el router se
                    // queda en la ruta actual en vez de completar la
                    // navegación pendiente (confirmado con la fila
                    // correctamente marcada `read_at` en la base, pero
                    // `page.url()` sin cambiar nunca, incluso esperando
                    // varios segundos). No es un problema de timing del
                    // lado del cliente -- pasaba siempre que la action se
                    // disparaba junto con el click, sin importar cuánto se
                    // esperara después.
                    //
                    // Por eso clickear una notificación con link SOLO
                    // navega -- ya NO la marca leída de forma automática.
                    // El marcado individual (punto 3 del enunciado) sigue
                    // cubierto igual, por el botón explícito "Marcar como
                    // leída" (`onMarkRead`, ver más abajo), que nunca
                    // compite con ninguna navegación. Cerrar el Popover se
                    // sigue difiriendo un tick (setTimeout) -- eso solo
                    // (sin la action de por medio) alcanza para no
                    // interferir con el click nativo del link.
                    setTimeout(() => setOpen(false), 0);
                  }}
                  onMarkRead={() => handleMarkOneRead(notification.id)}
                />
              ))}
            </ul>
          )}
          {/* Solo aparece cuando hay más para pedir -- desaparece sola
              (`hasMore` pasa a `false`) apenas el bloque que vuelve trae
              menos filas de las pedidas, sin que haga falta contar nada a
              mano del lado del cliente. Pedido explícito del enunciado:
              nunca recarga la página ni cierra el Popover -- solo agrega
              filas al final de la misma lista ya abierta. */}
          {!isLoading && notifications !== null && hasMore && (
            <div className="p-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full"
                disabled={isLoadingMore}
                onClick={handleLoadMore}
              >
                {isLoadingMore ? "Cargando…" : "Cargar más"}
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
