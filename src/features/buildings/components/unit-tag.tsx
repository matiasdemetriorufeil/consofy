import { cn } from "@/lib/utils";

interface UnitTagProps {
  unit: string;
  size?: "sm" | "default";
  className?: string;
}

const SIZE_CLASS: Record<NonNullable<UnitTagProps["size"]>, string> = {
  sm: "px-1.5 py-0.5 text-xs",
  default: "px-2 py-1 text-sm",
};

export function UnitTag({ unit, size = "default", className }: UnitTagProps) {
  return (
    <span
      className={cn(
        "border-border bg-surface text-ink inline-flex items-center justify-center rounded-md border font-mono font-medium tracking-wide",
        SIZE_CLASS[size],
        className,
      )}
    >
      {unit}
    </span>
  );
}
