import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type Priority = "urgente" | "alta" | "media" | "baja";

const PRIORITY_LABEL: Record<Priority, string> = {
  urgente: "Urgente",
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};

const PRIORITY_CLASS: Record<Priority, string> = {
  urgente: "bg-urgente/10 text-urgente",
  alta: "bg-alta/10 text-alta",
  media: "bg-media/10 text-media",
  baja: "bg-baja/10 text-baja",
};

interface PriorityBadgeProps {
  priority: Priority;
  className?: string;
}

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-body border-transparent",
        PRIORITY_CLASS[priority],
        className,
      )}
    >
      {PRIORITY_LABEL[priority]}
    </Badge>
  );
}
