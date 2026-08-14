import { Users } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UnitTag } from "@/features/buildings/components/unit-tag";
import { OCCUPANCY_ROLE_LABEL } from "@/features/people/occupancy-role";
import { getPeopleForBuilding } from "@/features/people/queries";
import { requireUser } from "@/lib/auth";

// Listado de solo lectura (paso 4.2, punto 3) -- ocupantes VIGENTES de
// este edificio (ver el comentario de getPeopleForBuilding()), sin alta ni
// edición todavía.
export default async function BuildingPeoplePage({
  params,
}: PageProps<"/panel/buildings/[buildingId]/people">) {
  const { organization } = await requireUser();
  const { buildingId } = await params;

  const people = await getPeopleForBuilding(organization.id, buildingId);

  if (people.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Todavía no hay vecinos cargados"
        description="Los propietarios e inquilinos de este edificio van a aparecer acá."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nombre</TableHead>
          <TableHead>Departamento</TableHead>
          <TableHead>Rol</TableHead>
          <TableHead>Teléfono</TableHead>
          <TableHead>Email</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {people.map((person) => (
          <TableRow key={person.occupancyId}>
            <TableCell className="font-medium">
              {person.firstName} {person.lastName ?? ""}
            </TableCell>
            <TableCell>
              <UnitTag
                unit={`${person.unitFloor}°${person.unitNumber}`}
                size="sm"
              />
            </TableCell>
            <TableCell>
              <span className="inline-flex items-center gap-1.5">
                {OCCUPANCY_ROLE_LABEL[person.role]}
                {person.isPrimary && (
                  <Badge variant="outline" className="text-xs">
                    Principal
                  </Badge>
                )}
              </span>
            </TableCell>
            <TableCell>{person.phoneE164 ?? "—"}</TableCell>
            <TableCell>{person.email ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
