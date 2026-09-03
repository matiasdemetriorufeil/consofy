"use client";

import { useMemo, useState } from "react";
import { type Control, useController } from "react-hook-form";
import { Check, ChevronsUpDown, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import type { PublicTicketFormInput } from "../ticket-schema";

export type PublicFormUnit = {
  id: string;
  tower: string | null;
  floor: string;
  number: string;
};

export function formatUnitLabel(unit: PublicFormUnit): string {
  const base = `${unit.floor}°${unit.number}`;
  return unit.tower ? `${unit.tower} - ${base}` : base;
}

// Cuántas unidades se muestran SIN que el vecino haya escrito nada. Por
// debajo, ver toda la lista de un saque (tocar y elegir) es más rápido que
// escribir. Por encima, la lista se vuelve la "tira interminable de
// opciones casi idénticas" que describe el paso 5.3 -- ahí conviene pedir
// que escriba antes de mostrar nada, en vez de forzar a scrollear 40, 100 o
// 200 filas para encontrar la propia. 20 es aproximadamente lo que entra
// en una pantalla de celular chica con scroll cómodo (ver
// src/features/public-form/components/ticket-form.tsx, mismo viewport de
// referencia que paso 5.1/5.2).
const IDLE_VISIBLE_LIMIT = 20;

// Tope de resultados renderizados incluso CON búsqueda activa -- protege el
// scroll (y el DOM) en un edificio de cientos de unidades si alguien
// busca algo tan corto ("1", "a") que matchea decenas. No es el caso común
// (alguien que escribe "3B" ya acota a un puñado), pero un edificio de 200
// unidades sí lo puede disparar con una búsqueda de un solo caracter.
const MAX_RESULTS_SHOWN = 30;

// Palabras de relleno que alguien puede tipear sin que cambien lo que busca
// ("piso 3" == "3", "depto B" == "B") -- se sacan ANTES de quitar espacios
// y símbolos, porque acá todavía son palabras completas separadas por
// espacio (más fácil de matchear con \b que después de compactar todo).
const FILLER_WORDS =
  /\b(piso|depto|departamento|dpto|unidad|numero|nro|torre)\b/gi;

// Normaliza para que "3B", "3 B", "3°B" y "piso 3 depto b" comparen igual:
// sin acentos, sin mayúsculas, sin las palabras de relleno de arriba, y sin
// ningún caracter que no sea letra o número (espacios, °, guiones,
// paréntesis). Ver el reporte del paso 5.3 para ejemplos reales corridos
// contra esta función, no solo el razonamiento.
export function normalizeUnitSearch(input: string): string {
  return input
    .normalize("NFD") // separa acentos de su letra ("é" -> "e" + acento)
    .toLowerCase()
    .replace(FILLER_WORDS, " ")
    .replace(/[^a-z0-9]/g, ""); // el acento ya suelto cae acá también -- no
  // hace falta un paso aparte para sacarlo, esta misma regex (solo
  // a-z0-9) ya lo descarta junto con espacios, "°", guiones, etc.
}

function unitHaystack(unit: PublicFormUnit): string {
  return normalizeUnitSearch(
    `${unit.tower ?? ""} ${unit.floor} ${unit.number}`,
  );
}

// Combo con búsqueda sobre las unidades reales del edificio (paso 5.3),
// para el paso 1 del formulario público. Reemplaza el <Select> simple +
// checkbox separada del paso 5.2 por UN solo control: abrir el combo
// ofrece buscar Y, si no encuentra nada, la salida de texto libre en el
// mismo lugar -- ver la justificación completa ("¿conviven selector y
// texto libre?") en el reporte de este paso. Los tres campos reales
// (unitId, unitNotListed, unitLabelRaw) siguen siendo los del schema del
// paso 5.2 (reflejan el CHECK real de tickets); esto solo cambia CÓMO se
// completan.
export function UnitCombobox({
  id,
  control,
  units,
}: {
  id: string;
  control: Control<PublicTicketFormInput>;
  units: PublicFormUnit[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const unitId = useController({ control, name: "unitId" });
  const unitLabelRaw = useController({ control, name: "unitLabelRaw" });
  const unitNotListed = useController({ control, name: "unitNotListed" });

  // Agrupar por torre solo tiene sentido con más de una torre Y sin
  // búsqueda activa -- ver decisión "cómo se manejan las torres" en el
  // reporte: no se fuerza un paso previo de "elegí tu torre", cada opción
  // ya lleva el nombre de la torre en su etiqueta, y buscando "norte" o
  // "sur" ya acota. Agrupar solo ayuda a ESCANEAR quieto, así que solo
  // aplica en la lista ociosa (idle).
  const towers = useMemo(
    () =>
      Array.from(
        new Set(units.map((u) => u.tower).filter((t): t is string => !!t)),
      ),
    [units],
  );

  const normalizedQuery = normalizeUnitSearch(query);
  const filtered = useMemo(() => {
    if (!normalizedQuery) {
      return units.length <= IDLE_VISIBLE_LIMIT ? units : [];
    }
    return units.filter((u) => unitHaystack(u).includes(normalizedQuery));
  }, [units, normalizedQuery]);

  const visible = filtered.slice(0, MAX_RESULTS_SHOWN);
  const truncated = filtered.length > visible.length;

  const grouped =
    !normalizedQuery && towers.length > 1 ? groupByTower(visible) : null;

  const selectedUnit = units.find((u) => u.id === unitId.field.value);
  const inFreeTextMode = unitNotListed.field.value;
  const triggerLabel = inFreeTextMode
    ? unitLabelRaw.field.value || "Contanos dónde vivís"
    : selectedUnit
      ? formatUnitLabel(selectedUnit)
      : "Elegí tu departamento";
  const triggerIsPlaceholder = inFreeTextMode
    ? !unitLabelRaw.field.value
    : !selectedUnit;

  function selectUnit(unit: PublicFormUnit) {
    unitId.field.onChange(unit.id);
    unitNotListed.field.onChange(false);
    unitLabelRaw.field.onChange(null);
    setOpen(false);
    setQuery("");
  }

  function applyFreeText(text: string) {
    unitNotListed.field.onChange(true);
    unitLabelRaw.field.onChange(text || null);
    unitId.field.onChange(null);
    setOpen(false);
  }

  const error = inFreeTextMode
    ? unitLabelRaw.fieldState.error
    : unitId.fieldState.error;

  return (
    <div className="flex flex-col gap-1.5">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            // Al reabrir en modo texto libre, precarga lo ya escrito para
            // poder seguir editándolo o volver a buscar -- no lo pisa.
            setQuery(inFreeTextMode ? (unitLabelRaw.field.value ?? "") : "");
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={!!error}
            // min-h-11 (~44px) explícito: como <Button> va dentro de
            // <PopoverTrigger asChild>, el data-slot que queda en el DOM es
            // "popover-trigger", así que el selector de touch-targets del
            // formulario (que apunta a [data-slot=button]) no lo alcanza.
            className="min-h-11 w-full justify-between font-normal"
          >
            <span
              className={cn(
                "truncate",
                triggerIsPlaceholder && "text-muted-foreground",
              )}
            >
              {triggerLabel}
            </span>
            <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-(--radix-popover-trigger-width) gap-0 p-0"
        >
          <div className="flex items-center gap-2 border-b px-2.5 py-2.5">
            <Search className="text-muted-foreground size-4 shrink-0" />
            {/* autoFocus: el popover recién se abre por una acción del
                vecino (tocar el combo); enfocar la búsqueda ahí mismo
                ahorra un toque extra, que es justo lo que este paso pide
                cuidar. */}
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscá tu piso o depto (ej: 3B)"
              className="placeholder:text-muted-foreground w-full bg-transparent text-base outline-none md:text-sm"
            />
          </div>

          <div role="listbox" className="max-h-64 overflow-y-auto p-1">
            {normalizedQuery === "" && units.length > IDLE_VISIBLE_LIMIT ? (
              <p className="text-muted-foreground px-3 py-6 text-center text-sm">
                Escribí para buscar tu unidad.
              </p>
            ) : filtered.length === 0 ? (
              <p className="text-muted-foreground px-3 py-4 text-sm">
                No encontramos &quot;{query}&quot; en la lista.
              </p>
            ) : grouped ? (
              Array.from(grouped.entries()).map(([tower, towerUnits]) => (
                <div key={tower}>
                  <p className="text-muted-foreground px-2.5 pt-2 pb-1 text-xs font-medium">
                    {tower}
                  </p>
                  {towerUnits.map((unit) => (
                    <UnitOption
                      key={unit.id}
                      unit={unit}
                      selected={unit.id === unitId.field.value}
                      onSelect={selectUnit}
                    />
                  ))}
                </div>
              ))
            ) : (
              visible.map((unit) => (
                <UnitOption
                  key={unit.id}
                  unit={unit}
                  selected={unit.id === unitId.field.value}
                  onSelect={selectUnit}
                />
              ))
            )}
            {truncated && (
              <p className="text-muted-foreground px-3 py-2 text-xs">
                Hay más resultados -- escribí más letras para acotar.
              </p>
            )}
          </div>

          <div className="border-t p-1">
            <button
              type="button"
              onClick={() => applyFreeText(query)}
              className="hover:bg-accent w-full rounded-md px-2.5 py-2.5 text-left text-sm"
            >
              No encuentro mi unidad
              {query ? ` -- usar "${query}"` : ""}
            </button>
          </div>
        </PopoverContent>
      </Popover>
      <FieldError errors={[error]} />
    </div>
  );
}

function groupByTower(units: PublicFormUnit[]): Map<string, PublicFormUnit[]> {
  const map = new Map<string, PublicFormUnit[]>();
  for (const unit of units) {
    const key = unit.tower ?? "Sin torre";
    const group = map.get(key);
    if (group) {
      group.push(unit);
    } else {
      map.set(key, [unit]);
    }
  }
  return map;
}

function UnitOption({
  unit,
  selected,
  onSelect,
}: {
  unit: PublicFormUnit;
  selected: boolean;
  onSelect: (unit: PublicFormUnit) => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={() => onSelect(unit)}
      className={cn(
        "hover:bg-accent flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2.5 text-left text-sm",
        selected && "bg-accent",
      )}
    >
      <span>{formatUnitLabel(unit)}</span>
      {selected && <Check className="size-4 shrink-0" />}
    </button>
  );
}
