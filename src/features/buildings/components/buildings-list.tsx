"use client";

import { Building2, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { setBuildingActiveAction } from "../actions";
import type { ManagedBuildingOption } from "../queries";
import { BuildingFormDialog } from "./building-form-dialog";
import { DeleteBuildingDialog } from "./delete-building-dialog";

type DialogState =
  | { type: "closed" }
  | { type: "create" }
  | { type: "edit"; building: ManagedBuildingOption }
  | { type: "delete"; building: ManagedBuildingOption };

export function BuildingsList({
  buildings,
}: {
  buildings: ManagedBuildingOption[];
}) {
  const [dialog, setDialog] = useState<DialogState>({ type: "closed" });
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [isToggling, startToggleTransition] = useTransition();

  function handleToggleActive(building: ManagedBuildingOption) {
    setTogglingId(building.id);
    startToggleTransition(async () => {
      const result = await setBuildingActiveAction(
        building.id,
        !building.active,
      );
      setTogglingId(null);
      if (result.ok) {
        toast.success(
          building.active
            ? `"${building.name}" se desactivó.`
            : `"${building.name}" se activó.`,
        );
      } else {
        toast.error(result.error ?? "No pudimos actualizar el edificio.");
      }
    });
  }

  const formDialogBuilding =
    dialog.type === "edit" ? dialog.building : undefined;
  const isFormDialogOpen = dialog.type === "create" || dialog.type === "edit";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-ink font-display text-xl font-semibold">
          Edificios
        </h1>
        <Button onClick={() => setDialog({ type: "create" })}>
          Nuevo edificio
        </Button>
      </div>

      {buildings.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Todavía no tenés ningún edificio cargado"
          description="Cargá el primero para empezar a recibir y gestionar reclamos."
          action={{
            label: "Cargar mi primer edificio",
            onClick: () => setDialog({ type: "create" }),
          }}
        />
      ) : (
        <>
          {/* Tabla en desktop (paso 4.1, punto 1) */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Prefijo</TableHead>
                  <TableHead>Dirección</TableHead>
                  <TableHead className="text-right">Departamentos</TableHead>
                  <TableHead className="text-right">Pendientes</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">Acciones</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {buildings.map((building) => (
                  <TableRow
                    key={building.id}
                    className={cn(!building.active && "text-muted-foreground")}
                  >
                    <TableCell className="font-medium text-inherit">
                      <Link
                        href={`/panel/buildings/${building.id}`}
                        className="outline-none hover:underline focus-visible:underline"
                      >
                        {building.name}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono">
                      {building.codePrefix}
                    </TableCell>
                    <TableCell>
                      {building.address}, {building.city}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {building.unitsCount}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {building.pendingTicketsCount}
                    </TableCell>
                    <TableCell>
                      <BuildingStatusBadge active={building.active} />
                    </TableCell>
                    <TableCell>
                      <BuildingRowMenu
                        building={building}
                        isToggling={isToggling && togglingId === building.id}
                        onEdit={() => setDialog({ type: "edit", building })}
                        onToggleActive={() => handleToggleActive(building)}
                        onDelete={() => setDialog({ type: "delete", building })}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Tarjetas en mobile (paso 4.1, punto 1) */}
          <div className="grid gap-3 md:hidden">
            {buildings.map((building) => (
              <Card
                key={building.id}
                className={cn(!building.active && "text-muted-foreground")}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-inherit">
                      <Link
                        href={`/panel/buildings/${building.id}`}
                        className="outline-none hover:underline focus-visible:underline"
                      >
                        {building.name}
                      </Link>
                    </CardTitle>
                    <BuildingRowMenu
                      building={building}
                      isToggling={isToggling && togglingId === building.id}
                      onEdit={() => setDialog({ type: "edit", building })}
                      onToggleActive={() => handleToggleActive(building)}
                      onDelete={() => setDialog({ type: "delete", building })}
                    />
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-2 text-sm">
                  <p className="text-muted-foreground">
                    {building.address}, {building.city}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="font-mono">{building.codePrefix}</span>
                    <span>
                      {building.unitsCount}{" "}
                      {building.unitsCount === 1
                        ? "departamento"
                        : "departamentos"}
                    </span>
                    <span>
                      {building.pendingTicketsCount} pendiente
                      {building.pendingTicketsCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  <BuildingStatusBadge
                    active={building.active}
                    className="w-fit"
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <BuildingFormDialog
        open={isFormDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDialog({ type: "closed" });
          }
        }}
        building={formDialogBuilding}
      />

      {dialog.type === "delete" && (
        <DeleteBuildingDialog
          building={dialog.building}
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

function BuildingStatusBadge({
  active,
  className,
}: {
  active: boolean;
  className?: string;
}) {
  return (
    <Badge variant={active ? "outline" : "secondary"} className={className}>
      {active ? "Activo" : "Inactivo"}
    </Badge>
  );
}

function BuildingRowMenu({
  building,
  isToggling,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  building: ManagedBuildingOption;
  isToggling: boolean;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Acciones para ${building.name}`}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onEdit}>Editar</DropdownMenuItem>
        <DropdownMenuItem disabled={isToggling} onSelect={onToggleActive}>
          {building.active ? "Desactivar edificio" : "Activar edificio"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          Dar de baja
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
