"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

import { RelativeDate } from "@/components/relative-date";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { TicketInboxRow } from "../queries";
import { toBadgePriority, toBadgeStatus } from "../status-mapping";
import type {
  TicketSortColumn,
  TicketSortDirection,
} from "../ticket-inbox-schema";
import { PriorityBadge } from "./priority-badge";
import { StatusBadge } from "./status-badge";
import { TicketBulkActionsBar } from "./ticket-bulk-actions-bar";
import { TicketCode } from "./ticket-code";

// Selección + tabla/tarjetas de la bandeja (paso 6.5) -- Client Component
// a propósito, a diferencia del resto de esta pantalla (que sigue siendo
// Server Component puro desde el paso 6.1): la selección es un estado que
// cruza TODAS las filas a la vez (cuántas hay tildadas, si "seleccionar
// todo" está activo), y eso solo se puede mantener coherente en un único
// componente de cliente que renderice filas Y sepa el total -- no hay
// forma de que cada fila sea su propio componente aislado y a la vez la
// barra de acciones sepa cuántas hay tildadas sin un estado compartido.
// Recibe los DATOS ya resueltos por el servidor (page.tsx sigue pidiendo
// todo con las mismas queries de siempre) -- este componente no hace
// ninguna consulta, solo selecciona y dispara las acciones.
export function TicketInboxList({
  tickets,
  showBuildingColumn,
  organizationTimezone,
  backQuery,
  activeSort,
  activeDir,
  sortHrefs,
  assigneeOptions,
  totalCount,
  rawFilters,
}: {
  tickets: TicketInboxRow[];
  showBuildingColumn: boolean;
  organizationTimezone: string;
  backQuery: string;
  activeSort: TicketSortColumn;
  activeDir: TicketSortDirection;
  sortHrefs: { priority: string; reportedAt: string };
  assigneeOptions: string[];
  totalCount: number;
  rawFilters: Record<string, string | undefined>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // "Seleccionar todos los N que matchean el filtro" (más allá de esta
  // página) -- ver el reporte del paso para la trampa que esto resuelve.
  // Estado APARTE de `selected` a propósito: mientras está activo, la
  // cuenta visible y la acción operan sobre TODO lo filtrado, no sobre los
  // ids de esta página nomás (que `selected` sigue conteniendo, para poder
  // volver atrás si se cancela).
  const [allFilteredSelected, setAllFilteredSelected] = useState(false);

  function toggleOne(id: string, checked: boolean) {
    setAllFilteredSelected(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  const pageIds = tickets.map((t) => t.id);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const somePageSelected = pageIds.some((id) => selected.has(id));

  function toggleAllOnPage(checked: boolean) {
    setAllFilteredSelected(false);
    setSelected(checked ? new Set(pageIds) : new Set());
  }

  function clearSelection() {
    setSelected(new Set());
    setAllFilteredSelected(false);
  }

  const selectedCount = allFilteredSelected ? totalCount : selected.size;
  const hasMoreBeyondPage = totalCount > pageIds.length;
  // Solo se ofrece la escalada cuando la página ENTERA ya está tildada --
  // tildar 3 de cada 25 a mano y ofrecer "seleccionar los 500" no tiene
  // ningún sentido, la escalada es específicamente la salida de "quiero
  // TODO lo que ve este filtro", no un atajo general.
  const showSelectAllFilteredHint =
    allPageSelected && hasMoreBeyondPage && !allFilteredSelected;

  const selection = allFilteredSelected
    ? { mode: "filtered" as const, filters: rawFilters }
    : { mode: "ids" as const, ticketIds: [...selected] };

  function detailHref(ticketId: string): string {
    return backQuery
      ? `/panel/tickets/${ticketId}?from=${encodeURIComponent(backQuery)}`
      : `/panel/tickets/${ticketId}`;
  }

  function sortIndicator(column: TicketSortColumn) {
    if (activeSort !== column) {
      return null;
    }
    return activeDir === "desc" ? (
      <ArrowDown aria-hidden="true" className="size-3.5" />
    ) : (
      <ArrowUp aria-hidden="true" className="size-3.5" />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {showSelectAllFilteredHint && (
        <p className="bg-muted/40 rounded-md px-3 py-2 text-sm">
          Seleccionaste los {pageIds.length} reclamos de esta página.{" "}
          <button
            type="button"
            className="text-primary underline underline-offset-2"
            onClick={() => setAllFilteredSelected(true)}
          >
            Seleccionar los {totalCount} reclamos que coinciden con estos
            filtros
          </button>
          .
        </p>
      )}
      {allFilteredSelected && (
        <p className="bg-muted/40 rounded-md px-3 py-2 text-sm">
          Están seleccionados los {totalCount} reclamos que coinciden con estos
          filtros, no solo los de esta página.
        </p>
      )}

      {/* Desktop: tabla. Mobile: tarjetas apiladas -- mismo criterio del
          paso 6.1, ahora con una casilla por fila en los dos layouts. */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={
                    allFilteredSelected ||
                    (allPageSelected
                      ? true
                      : somePageSelected
                        ? "indeterminate"
                        : false)
                  }
                  onCheckedChange={(checked) => toggleAllOnPage(!!checked)}
                  aria-label="Seleccionar todos los reclamos de esta página"
                />
              </TableHead>
              <TableHead>Código</TableHead>
              {showBuildingColumn && <TableHead>Edificio</TableHead>}
              <TableHead>Unidad</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Título</TableHead>
              <TableHead>
                <Link
                  href={sortHrefs.priority}
                  className="hover:text-ink inline-flex items-center gap-1"
                >
                  Prioridad
                  {sortIndicator("priority")}
                </Link>
              </TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>
                <Link
                  href={sortHrefs.reportedAt}
                  className="hover:text-ink inline-flex items-center gap-1"
                >
                  Reportado
                  {sortIndicator("reportedAt")}
                </Link>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.map((ticket) => (
              <TableRow key={ticket.id}>
                <TableCell>
                  <Checkbox
                    checked={allFilteredSelected || selected.has(ticket.id)}
                    onCheckedChange={(checked) =>
                      toggleOne(ticket.id, !!checked)
                    }
                    aria-label={`Seleccionar reclamo ${ticket.publicCode}`}
                  />
                </TableCell>
                <TableCell>
                  <TicketCode code={ticket.publicCode} />
                </TableCell>
                {showBuildingColumn && (
                  <TableCell className="max-w-40 truncate">
                    {ticket.buildingName}
                  </TableCell>
                )}
                <TableCell className="text-ink-muted">
                  {ticket.unitLabel ?? "—"}
                </TableCell>
                <TableCell>{ticket.categoryName}</TableCell>
                <TableCell className="max-w-64 truncate">
                  <Link
                    href={detailHref(ticket.id)}
                    className="outline-none hover:underline focus-visible:underline"
                  >
                    {ticket.title}
                  </Link>
                </TableCell>
                <TableCell>
                  <PriorityBadge priority={toBadgePriority(ticket.priority)} />
                </TableCell>
                <TableCell>
                  <StatusBadge status={toBadgeStatus(ticket.status)} />
                </TableCell>
                <TableCell>
                  <RelativeDate
                    date={ticket.reportedAt}
                    timezone={organizationTimezone}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="flex flex-col gap-2 md:hidden">
        {tickets.map((ticket) => (
          <li
            key={ticket.id}
            className="border-border bg-surface flex flex-col gap-2 rounded-lg border p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <Checkbox
                  checked={allFilteredSelected || selected.has(ticket.id)}
                  onCheckedChange={(checked) => toggleOne(ticket.id, !!checked)}
                  aria-label={`Seleccionar reclamo ${ticket.publicCode}`}
                  className="size-5"
                />
                <TicketCode code={ticket.publicCode} />
              </div>
              <RelativeDate
                date={ticket.reportedAt}
                timezone={organizationTimezone}
                className="text-ink-muted text-xs"
              />
            </div>
            <Link
              href={detailHref(ticket.id)}
              className="text-ink truncate text-sm font-medium hover:underline"
            >
              {ticket.title}
            </Link>
            <p className="text-ink-muted truncate text-xs">
              {showBuildingColumn ? `${ticket.buildingName} · ` : ""}
              {ticket.unitLabel ?? "Sin unidad"} · {ticket.categoryName}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <PriorityBadge priority={toBadgePriority(ticket.priority)} />
              <StatusBadge status={toBadgeStatus(ticket.status)} />
            </div>
          </li>
        ))}
      </ul>

      {selectedCount > 0 && (
        <TicketBulkActionsBar
          selectedCount={selectedCount}
          selection={selection}
          assigneeOptions={assigneeOptions}
          onClear={clearSelection}
        />
      )}
    </div>
  );
}
