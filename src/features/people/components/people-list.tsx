"use client";

import { MoreHorizontal, Search, Users } from "lucide-react";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
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
import type { BuildingUnitRow } from "@/features/units/queries";

import { OCCUPANCY_ROLE_LABEL } from "../occupancy-role";
import type { BuildingOccupancyRow } from "../queries";
import { CloseOccupancyDialog } from "./close-occupancy-dialog";
import { DeletePersonDialog } from "./delete-person-dialog";
import { PersonFormDialog } from "./person-form-dialog";
import { PersonOccupancyDialog } from "./person-occupancy-dialog";

type DialogState =
  | { type: "closed" }
  | { type: "add" }
  | { type: "edit"; occupancy: BuildingOccupancyRow }
  | { type: "close-occupancy"; occupancy: BuildingOccupancyRow }
  | { type: "delete"; occupancy: BuildingOccupancyRow };

// Sin paginación (paso 4.4, misma decisión que UnitsList en el paso 4.3 --
// decisión 5 del reporte): un edificio tiene, como mucho, unas pocas
// centenas de ocupaciones entre vigentes e historial, livianas de traer y
// renderizar de una sola vez. Búsqueda de CLIENTE, no una consulta nueva --
// ya se trajo la lista completa.
export function PeopleList({
  buildingId,
  units,
  occupancies,
}: {
  buildingId: string;
  units: BuildingUnitRow[];
  occupancies: BuildingOccupancyRow[];
}) {
  const [dialog, setDialog] = useState<DialogState>({ type: "closed" });
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return occupancies;
    }
    return occupancies.filter((occupancy) => {
      const haystack = [
        occupancy.firstName,
        occupancy.lastName ?? "",
        occupancy.phoneE164 ?? "",
        occupancy.email ?? "",
        occupancy.unitTower ?? "",
        occupancy.unitFloor,
        occupancy.unitNumber,
        OCCUPANCY_ROLE_LABEL[occupancy.role],
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [occupancies, search]);

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
            placeholder="Buscar vecino…"
            aria-label="Buscar vecino"
            className="pl-8"
          />
        </div>
        <Button
          onClick={() => setDialog({ type: "add" })}
          disabled={units.length === 0}
        >
          Agregar vecino
        </Button>
      </div>

      {occupancies.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Todavía no hay vecinos cargados"
          description={
            units.length === 0
              ? "Cargá unidades en la pestaña Unidades antes de poder asignar vecinos."
              : "Los propietarios e inquilinos de este edificio van a aparecer acá."
          }
          action={
            units.length > 0
              ? {
                  label: "Agregar el primer vecino",
                  onClick: () => setDialog({ type: "add" }),
                }
              : undefined
          }
        />
      ) : filtered.length === 0 ? (
        <p className="text-ink-muted text-sm">
          Ningún vecino coincide con &quot;{search}&quot;.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Departamento</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((occupancy) => {
              const isCurrent = occupancy.endedOn === null;
              return (
                <TableRow key={occupancy.occupancyId}>
                  <TableCell className="font-medium">
                    {occupancy.firstName} {occupancy.lastName ?? ""}
                  </TableCell>
                  <TableCell>
                    <UnitTag
                      unit={`${occupancy.unitFloor}°${occupancy.unitNumber}`}
                      size="sm"
                    />
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5">
                      {OCCUPANCY_ROLE_LABEL[occupancy.role]}
                      {occupancy.isPrimary && (
                        <Badge variant="outline" className="text-xs">
                          Principal
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell>
                    {isCurrent ? (
                      <Badge variant="secondary">Vigente</Badge>
                    ) : (
                      <span className="text-ink-muted text-sm">
                        Finalizada ({occupancy.endedOn})
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{occupancy.phoneE164 ?? "—"}</TableCell>
                  <TableCell>{occupancy.email ?? "—"}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Acciones para ${occupancy.firstName}`}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() =>
                            setDialog({ type: "edit", occupancy })
                          }
                        >
                          Editar vecino
                        </DropdownMenuItem>
                        {isCurrent && (
                          <DropdownMenuItem
                            onSelect={() =>
                              setDialog({
                                type: "close-occupancy",
                                occupancy,
                              })
                            }
                          >
                            Finalizar ocupación
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() =>
                            setDialog({ type: "delete", occupancy })
                          }
                        >
                          Dar de baja vecino
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <PersonOccupancyDialog
        open={dialog.type === "add"}
        onOpenChange={(open) => {
          if (!open) {
            setDialog({ type: "closed" });
          }
        }}
        buildingId={buildingId}
        units={units}
      />

      {dialog.type === "edit" && (
        <PersonFormDialog
          person={dialog.occupancy}
          open
          onOpenChange={(open) => {
            if (!open) {
              setDialog({ type: "closed" });
            }
          }}
        />
      )}

      {dialog.type === "close-occupancy" && (
        <CloseOccupancyDialog
          buildingId={buildingId}
          occupancy={dialog.occupancy}
          open
          onOpenChange={(open) => {
            if (!open) {
              setDialog({ type: "closed" });
            }
          }}
        />
      )}

      {dialog.type === "delete" && (
        <DeletePersonDialog
          person={dialog.occupancy}
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
