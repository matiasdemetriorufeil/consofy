import { PeopleList } from "@/features/people/components/people-list";
import { getOccupancyRowsForBuilding } from "@/features/people/queries";
import { getUnitsForBuilding } from "@/features/units/queries";
import { requireUser } from "@/lib/auth";

// ABM de personas y su asignación a unidades (paso 4.4), sobre el listado
// de solo lectura del paso 4.2. `organization.id` sale de requireUser(),
// que el layout de este mismo segmento ya llamó -- cache() de React (ver
// src/lib/auth.ts) hace que esto no repita esa consulta. `units` alimenta
// el selector de unidad del diálogo de alta -- se pide acá (Server
// Component) y no en el cliente para no necesitar una Server Action solo
// para poblar un <select>.
export default async function BuildingPeoplePage({
  params,
}: PageProps<"/panel/buildings/[buildingId]/people">) {
  const { organization } = await requireUser();
  const { buildingId } = await params;

  const [occupancies, units] = await Promise.all([
    getOccupancyRowsForBuilding(organization.id, buildingId),
    getUnitsForBuilding(organization.id, buildingId),
  ]);

  return (
    <PeopleList
      buildingId={buildingId}
      units={units}
      occupancies={occupancies}
    />
  );
}
