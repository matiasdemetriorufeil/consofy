import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { getTicketPageNumbers } from "../ticket-inbox-schema";

// Server Component puro (paso 6.2) -- son Links de Next.js armados con el
// href ya resuelto (ver buildTicketInboxHref en ticket-inbox-schema.ts),
// nunca un onClick de cliente: la página siguiente no depende de nada que
// el servidor no supiera al renderizar esta misma respuesta.
export function TicketPagination({
  currentPage,
  totalPages,
  buildHref,
}: {
  currentPage: number;
  totalPages: number;
  buildHref: (page: number) => string;
}) {
  if (totalPages <= 1) {
    return null;
  }

  const pageNumbers = getTicketPageNumbers(currentPage, totalPages);

  return (
    <nav
      aria-label="Paginación de reclamos"
      className="flex items-center justify-center gap-1"
    >
      <Button
        asChild={currentPage > 1}
        variant="outline"
        size="icon-sm"
        disabled={currentPage <= 1}
        aria-label="Página anterior"
      >
        {currentPage > 1 ? (
          <Link href={buildHref(currentPage - 1)}>
            <ChevronLeft aria-hidden="true" />
          </Link>
        ) : (
          <ChevronLeft aria-hidden="true" />
        )}
      </Button>

      {pageNumbers.map((entry, index) =>
        entry === "ellipsis" ? (
          <span
            key={`ellipsis-${index}`}
            className="text-ink-muted px-1.5 text-sm"
            aria-hidden="true"
          >
            …
          </span>
        ) : (
          <Button
            key={entry}
            asChild={entry !== currentPage}
            variant={entry === currentPage ? "secondary" : "ghost"}
            size="icon-sm"
            aria-current={entry === currentPage ? "page" : undefined}
            aria-label={`Página ${entry}`}
            className={cn(
              entry === currentPage && "pointer-events-none font-semibold",
            )}
          >
            {entry !== currentPage ? (
              <Link href={buildHref(entry)}>{entry}</Link>
            ) : (
              entry
            )}
          </Button>
        ),
      )}

      <Button
        asChild={currentPage < totalPages}
        variant="outline"
        size="icon-sm"
        disabled={currentPage >= totalPages}
        aria-label="Página siguiente"
      >
        {currentPage < totalPages ? (
          <Link href={buildHref(currentPage + 1)}>
            <ChevronRight aria-hidden="true" />
          </Link>
        ) : (
          <ChevronRight aria-hidden="true" />
        )}
      </Button>
    </nav>
  );
}
