import { Check } from "lucide-react";
import Link from "next/link";

import { RelativeDate } from "@/components/relative-date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  NOTIFICATION_TYPE_ACCENT,
  NOTIFICATION_TYPE_LABEL,
} from "../notification-type";
import type { NotificationRow } from "../queries";

// Mismos dos tokens que PriorityBadge/ReminderUrgencyBadge (ver el
// comentario de NOTIFICATION_TYPE_ACCENT en notification-type.ts) --
// ningún color nuevo definido acá.
const ACCENT_CLASS = {
  urgente: "bg-urgente/10 text-urgente",
  alta: "bg-alta/10 text-alta",
} as const;

// Una fila del centro de notificaciones (paso 9.3). `<Link>` y el botón de
// "marcar como leída" son HERMANOS, nunca uno anidado dentro del otro --
// un <button> dentro de un <a> es HTML inválido (dos elementos
// interactivos anidados), con problemas reales de foco/lectura de
// pantalla, no solo un detalle cosmético.
export function NotificationItem({
  notification,
  timezone,
  onNavigate,
  onMarkRead,
  isPending,
}: {
  notification: NotificationRow;
  timezone: string;
  onNavigate: () => void;
  onMarkRead: () => void;
  isPending: boolean;
}) {
  const isUnread = !notification.readAt;
  const accent = NOTIFICATION_TYPE_ACCENT[notification.type];

  const content = (
    <div className="min-w-0 flex-1">
      <p className={cn("text-ink text-sm", isUnread && "font-medium")}>
        {notification.title}
      </p>
      <p className="text-ink-muted line-clamp-2 text-sm">{notification.body}</p>
      <p className="text-ink-muted mt-1 flex items-center gap-1.5 text-xs">
        <RelativeDate date={notification.createdAt} timezone={timezone} />
        <span aria-hidden="true">·</span>
        {accent ? (
          <Badge
            variant="outline"
            className={cn("font-body border-transparent", ACCENT_CLASS[accent])}
          >
            {NOTIFICATION_TYPE_LABEL[notification.type]}
          </Badge>
        ) : (
          NOTIFICATION_TYPE_LABEL[notification.type]
        )}
      </p>
    </div>
  );

  return (
    <li
      className={cn("flex items-start gap-2 p-3", isUnread && "bg-primary/5")}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-1.5 size-2 shrink-0 rounded-full",
          isUnread ? "bg-primary" : "bg-transparent",
        )}
      />
      {notification.link ? (
        <Link
          href={notification.link}
          onClick={onNavigate}
          className="focus-visible:ring-ring/50 -m-1 min-w-0 flex-1 rounded-md p-1 outline-none focus-visible:ring-3"
        >
          {content}
        </Link>
      ) : (
        content
      )}
      {isUnread && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={isPending}
          aria-label="Marcar como leída"
          onClick={onMarkRead}
        >
          <Check aria-hidden="true" />
        </Button>
      )}
    </li>
  );
}
