"use client";

import { ListFilter, Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { BuildingFilterOption } from "@/features/buildings/queries";
import type { BuildingUnitRow } from "@/features/units/queries";

import type { CategoryFilterOption } from "../queries";
import {
  TICKET_PRIORITY_FILTER_VALUES,
  TICKET_STATUS_FILTER_VALUES,
  UNASSIGNED_ASSIGNEE_VALUE,
} from "../ticket-inbox-schema";

// Sentinel para "todas las opciones" en cada <Select> -- Radix Select no
// admite value="" en un SelectItem (lo trata como "sin selección" y tira
// una advertencia en consola), así que cada filtro "vacío" en la URL se
// representa acá con este string, nunca con "".
const ALL_VALUE = "__todos__";

const STATUS_LABELS: Record<
  (typeof TICKET_STATUS_FILTER_VALUES)[number],
  string
> = {
  open: "Abiertos",
  all: "Todos los estados",
  new: "Nuevo",
  in_progress: "En progreso",
  resolved: "Resuelto",
  closed: "Cerrado",
  discarded: "Descartado",
};

const PRIORITY_LABELS: Record<
  (typeof TICKET_PRIORITY_FILTER_VALUES)[number],
  string
> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  urgent: "Urgente",
};

type Props = {
  buildingOptions: BuildingFilterOption[];
  unitOptions: BuildingUnitRow[];
  categoryOptions: CategoryFilterOption[];
  assigneeOptions: string[];
  current: {
    building: string | null;
    unit: string | null;
    category: string | null;
    status: (typeof TICKET_STATUS_FILTER_VALUES)[number];
    priority: string | null;
    assignee: string | null;
    from: string | null;
    to: string | null;
    q: string | null;
  };
  activeFilterCount: number;
};

function formatUnitOptionLabel(unit: BuildingUnitRow): string {
  return unit.tower
    ? `${unit.tower} - ${unit.floor}°${unit.number}`
    : `${unit.floor}°${unit.number}`;
}

export function TicketFiltersBar({
  buildingOptions,
  unitOptions,
  categoryOptions,
  assigneeOptions,
  current,
  activeFilterCount,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [searchInput, setSearchInput] = useState(current.q ?? "");

  // Sincroniza el input si la URL cambia por otra vía (ej. "Limpiar
  // filtros", atrás/adelante del navegador) -- sin esto, el campo de
  // búsqueda quedaría mostrando texto viejo que ya no representa la URL
  // real. Ajustado DURANTE el render, no en un efecto -- mismo patrón que
  // MobileNavDrawer (ver ese componente): la propia documentación de React
  // recomienda esto para "resetear estado cuando cambia una prop", evita
  // el render en cascada de un setState dentro de un useEffect.
  const [prevQ, setPrevQ] = useState(current.q ?? "");
  if ((current.q ?? "") !== prevQ) {
    setPrevQ(current.q ?? "");
    setSearchInput(current.q ?? "");
  }

  function updateParams(
    updates: Record<string, string | null>,
    options?: { push?: boolean },
  ) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === ALL_VALUE || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    const query = params.toString();
    const url = query ? `${pathname}?${query}` : pathname;
    if (options?.push === false) {
      router.replace(url, { scroll: false });
    } else {
      router.push(url, { scroll: false });
    }
  }

  // Cambiar de edificio invalida cualquier unidad elegida -- una unidad
  // pertenece a UN edificio puntual, así que arrastrar el filtro de unidad
  // a un edificio distinto (o a "todos") mostraría un <select> con una
  // opción que ni siquiera pertenece a la lista nueva.
  function handleBuildingChange(value: string) {
    updateParams({ building: value === ALL_VALUE ? null : value, unit: null });
  }

  // Debounce de 400ms: empuja a la URL recién cuando el admin deja de
  // tipear, no en cada tecla -- mismo patrón (setTimeout + useEffect) que
  // ya usa BuildingForm para su validación en vivo (ver ese componente).
  useEffect(() => {
    const trimmed = searchInput.trim();
    const currentQ = current.q ?? "";
    if (trimmed === currentQ) {
      return;
    }
    const timeout = setTimeout(() => {
      updateParams({ q: trimmed || null }, { push: false });
    }, 400);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- updateParams depende de searchParams/pathname/router, estables entre renders para este efecto puntual; incluirlos re-dispararía el debounce sin necesidad.
  }, [searchInput]);

  // flex-col en mobile (dentro del Sheet, apilado), flex-row + wrap en
  // desktop (md:) -- cada <Field> lleva un ancho fijo en md: para que el
  // wrap arme filas prolijas en vez de una sola columna angosta empujando
  // la tabla hacia la derecha. Mismo árbol de JSX para las dos, sin
  // duplicar el formulario -- solo cambian las clases responsive.
  const filterControls = (
    <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end">
      <Field className="md:w-44">
        <FieldLabel htmlFor="filter-building">Edificio</FieldLabel>
        <Select
          value={current.building ?? ALL_VALUE}
          onValueChange={handleBuildingChange}
        >
          <SelectTrigger id="filter-building">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Todos los edificios</SelectItem>
            {buildingOptions.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
                {!b.active && " (pausado)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field className="md:w-44">
        <FieldLabel htmlFor="filter-unit">Unidad</FieldLabel>
        <Select
          value={current.unit ?? ALL_VALUE}
          onValueChange={(value) =>
            updateParams({ unit: value === ALL_VALUE ? null : value })
          }
          disabled={!current.building}
        >
          <SelectTrigger id="filter-unit">
            <SelectValue
              placeholder={
                current.building
                  ? "Todas las unidades"
                  : "Elegí un edificio primero"
              }
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Todas las unidades</SelectItem>
            {unitOptions.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {formatUnitOptionLabel(u)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field className="md:w-44">
        <FieldLabel htmlFor="filter-category">Categoría</FieldLabel>
        <Select
          value={current.category ?? ALL_VALUE}
          onValueChange={(value) =>
            updateParams({ category: value === ALL_VALUE ? null : value })
          }
        >
          <SelectTrigger id="filter-category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Todas las categorías</SelectItem>
            {categoryOptions.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field className="md:w-36">
        <FieldLabel htmlFor="filter-status">Estado</FieldLabel>
        <Select
          value={current.status}
          onValueChange={(value) => updateParams({ status: value })}
        >
          <SelectTrigger id="filter-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TICKET_STATUS_FILTER_VALUES.map((value) => (
              <SelectItem key={value} value={value}>
                {STATUS_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field className="md:w-36">
        <FieldLabel htmlFor="filter-priority">Prioridad</FieldLabel>
        <Select
          value={current.priority ?? ALL_VALUE}
          onValueChange={(value) =>
            updateParams({ priority: value === ALL_VALUE ? null : value })
          }
        >
          <SelectTrigger id="filter-priority">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Todas las prioridades</SelectItem>
            {TICKET_PRIORITY_FILTER_VALUES.map((p) => (
              <SelectItem key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field className="md:w-44">
        <FieldLabel htmlFor="filter-assignee">Responsable</FieldLabel>
        <Select
          value={current.assignee ?? ALL_VALUE}
          onValueChange={(value) =>
            updateParams({ assignee: value === ALL_VALUE ? null : value })
          }
        >
          <SelectTrigger id="filter-assignee">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Todos</SelectItem>
            <SelectItem value={UNASSIGNED_ASSIGNEE_VALUE}>
              Sin asignar
            </SelectItem>
            {assigneeOptions.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-3 md:w-56">
        <Field>
          <FieldLabel htmlFor="filter-from">Desde</FieldLabel>
          <Input
            id="filter-from"
            type="date"
            value={current.from ?? ""}
            max={current.to ?? undefined}
            onChange={(e) => updateParams({ from: e.target.value || null })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="filter-to">Hasta</FieldLabel>
          <Input
            id="filter-to"
            type="date"
            value={current.to ?? ""}
            min={current.from ?? undefined}
            onChange={(e) => updateParams({ to: e.target.value || null })}
          />
        </Field>
      </div>

      {activeFilterCount > 0 && (
        <Button
          variant="outline"
          className="md:self-end"
          onClick={() => {
            router.push(pathname, { scroll: false });
            setSheetOpen(false);
          }}
        >
          <X aria-hidden="true" />
          Limpiar filtros
        </Button>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search
            aria-hidden="true"
            className="text-ink-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <Input
            type="search"
            placeholder="Buscar por código, descripción o vecino…"
            className="pl-9"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Buscar reclamos"
          />
        </div>

        {/* Desktop: los filtros quedan siempre visibles abajo (el bloque
            "hidden md:flex" al final), no hace falta un botón que los
            esconda -- este trigger de Sheet es solo para mobile. */}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="shrink-0 md:hidden">
              <ListFilter aria-hidden="true" />
              Filtros
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-1 rounded-full px-1.5">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Filtros</SheetTitle>
            </SheetHeader>
            <div className="px-4 pb-6">{filterControls}</div>
          </SheetContent>
        </Sheet>
      </div>

      {/* filterControls ya trae su propio flex-row/flex-wrap en md: (ver
          arriba) -- este contenedor solo decide si se muestra o no. */}
      <div className="hidden md:block">{filterControls}</div>
    </div>
  );
}
