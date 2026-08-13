import { formatExactDate, formatRelativeDate } from "@/lib/format-date";

// Genérico, sin conocimiento del dominio -- ver CLAUDE.md > Estructura de
// carpetas. Server Component puro: el tooltip con la fecha exacta es el
// atributo nativo `title` del navegador, no hace falta JS ni "use client"
// para mostrarlo al pasar el mouse.
export function RelativeDate({
  date,
  timezone,
  className,
}: {
  date: Date;
  timezone: string;
  className?: string;
}) {
  return (
    <time
      dateTime={date.toISOString()}
      title={formatExactDate(date, timezone)}
      className={className}
    >
      {formatRelativeDate(date)}
    </time>
  );
}
