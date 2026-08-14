"use client";

import { LayoutGrid, MoreHorizontal, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UnitTag } from "@/features/buildings/components/unit-tag";
import { UNIT_TYPE_LABEL } from "@/features/buildings/unit-type";

import type { BuildingUnitRow } from "../queries";
import { BulkUnitsDialog } from "./bulk-units-dialog";
import { DeleteUnitDialog } from "./delete-unit-dialog";
import { UnitFormDialog } from "./unit-form-dialog";

type DialogState =
  | { type: "closed" }
  | { type: "create" }
  | { type: "bulk" }
  | { type: "edit"; unit: BuildingUnitRow }
  | { type: "delete"; unit: BuildingUnitRow };

// Sin paginación (paso 4.3, misma decisión que el listado de solo lectura
// del paso 4.2 -- ver el comentario de getUnitsForBuilding()): unas pocas
// centenas de filas siguen siendo livianas de traer y renderizar de una
// sola vez. Lo que SÍ suma en este paso es la búsqueda: con alta/baja/edición
// y hasta 300 unidades nuevas de una creación masiva, encontrar UNA unidad
// puntual en la lista para editarla se vuelve real. Es un filtro de
// CLIENTE, no una consulta nueva -- ya se trajo la lista completa, filtrar
// en memoria es prácticamente gratis y no le suma carga a la base.
export function UnitsList({
  buildingId,
  units,
}: {
  buildingId: string;
  units: BuildingUnitRow[];
}) {
  const [dialog, setDialog] = useState<DialogState>({ type: "closed" });
  const [search, setSearch] = useState("");

  const filteredUnits = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return units;
    }
    return units.filter((unit) => {
      const haystack = [
        unit.tower ?? "",
        unit.floor,
        unit.number,
        UNIT_TYPE_LABEL[unit.type],
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [units, search]);

  const editDialogUnit = dialog.type === "edit" ? dialog.unit : undefined;
  const isFormDialogOpen = dialog.type === "create" || dialog.type === "edit";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-64">
          <Search
            className="text-ink-muted pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar unidad…"
            aria-label="Buscar unidad"
            className="pl-8"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setDialog({ type: "bulk" })}>
            Crear varias
          </Button>
          <Button onClick={() => setDialog({ type: "create" })}>
            Nueva unidad
          </Button>
        </div>
      </div>

      {units.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="Todavía no hay departamentos cargados"
          description="Cargá la primera unidad, o generá varias de una con pisos y departamentos en rango."
          action={{
            label: "Cargar la primera unidad",
            onClick: () => setDialog({ type: "create" }),
          }}
        />
      ) : filteredUnits.length === 0 ? (
        <p className="text-ink-muted text-sm">
          Ninguna unidad coincide con &quot;{search}&quot;.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Departamento</TableHead>
              <TableHead>Torre</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUnits.map((unit) => (
              <TableRow key={unit.id}>
                <TableCell>
                  <UnitTag unit={`${unit.floor}°${unit.number}`} size="sm" />
                </TableCell>
                <TableCell>{unit.tower ?? "—"}</TableCell>
                <TableCell>{UNIT_TYPE_LABEL[unit.type]}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Acciones para ${unit.floor}°${unit.number}`}
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={() => setDialog({ type: "edit", unit })}
                      >
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setDialog({ type: "delete", unit })}
                      >
                        Dar de baja
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <UnitFormDialog
        open={isFormDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDialog({ type: "closed" });
          }
        }}
        buildingId={buildingId}
        unit={editDialogUnit}
      />

      <BulkUnitsDialog
        open={dialog.type === "bulk"}
        onOpenChange={(open) => {
          if (!open) {
            setDialog({ type: "closed" });
          }
        }}
        buildingId={buildingId}
      />

      {dialog.type === "delete" && (
        <DeleteUnitDialog
          buildingId={buildingId}
          unit={dialog.unit}
          open
          onOpenChange={(open) => {
            if (!open) {
              setDialog({ type: "closed" });
            }
          }}
        />
      )}
    </div>
  );
}
