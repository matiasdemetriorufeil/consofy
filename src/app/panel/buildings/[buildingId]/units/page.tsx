import { LayoutGrid } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
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
import { getUnitsForBuilding } from "@/features/units/queries";
import { requireUser } from "@/lib/auth";

// Listado de solo lectura (paso 4.2, punto 3) -- sin alta ni edición
// todavía, eso es el paso 4.3. `organization.id` sale de requireUser(),
// que el layout de este mismo segmento ya llamó -- cache() de React (ver
// src/lib/auth.ts) hace que esto no repita esa consulta, solo agrega la
// propia de getUnitsForBuilding().
export default async function BuildingUnitsPage({
  params,
}: PageProps<"/panel/buildings/[buildingId]/units">) {
  const { organization } = await requireUser();
  const { buildingId } = await params;

  const units = await getUnitsForBuilding(organization.id, buildingId);

  if (units.length === 0) {
    return (
      <EmptyState
        icon={LayoutGrid}
        title="Todavía no hay departamentos cargados"
        description="Las unidades de este edificio van a aparecer acá."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Departamento</TableHead>
          <TableHead>Torre</TableHead>
          <TableHead>Tipo</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {units.map((unit) => (
          <TableRow key={unit.id}>
            <TableCell>
              <UnitTag unit={`${unit.floor}°${unit.number}`} size="sm" />
            </TableCell>
            <TableCell>{unit.tower ?? "—"}</TableCell>
            <TableCell>{UNIT_TYPE_LABEL[unit.type]}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
