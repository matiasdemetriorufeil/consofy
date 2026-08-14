"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import type { BuildingEditableFields } from "../queries";
import { BuildingFormDialog } from "./building-form-dialog";

// Encabezado de la vista de detalle (paso 4.2, punto 2): reutiliza
// BuildingFormDialog/BuildingForm del paso 4.1 sin cambios de comportamiento
// -- lo único nuevo acá es el estado local del diálogo (antes lo manejaba
// buildings-list.tsx para toda la fila; acá solo hace falta para este botón
// "Editar edificio").
//
// Nunca muestra `public_token` ni el link público -- ni siquiera podría:
// `building` es un BuildingEditableFields, y getBuildingDetail() (que lo
// resuelve) directamente no selecciona esa columna. Mostrarlo es el paso
// 4.6.
export function BuildingDetailHeader({
  building,
}: {
  building: BuildingEditableFields;
}) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-ink font-display text-xl font-semibold">
            {building.name}
          </h1>
          <Badge variant="outline" className="font-mono">
            {building.codePrefix}
          </Badge>
          <Badge variant={building.active ? "outline" : "secondary"}>
            {building.active ? "Activo" : "Inactivo"}
          </Badge>
        </div>
        <p className="text-ink-muted text-sm">
          {building.address}, {building.city}
        </p>
      </div>

      <Button
        variant="outline"
        className="self-start"
        onClick={() => setEditOpen(true)}
      >
        Editar edificio
      </Button>

      <BuildingFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        building={building}
      />
    </div>
  );
}
