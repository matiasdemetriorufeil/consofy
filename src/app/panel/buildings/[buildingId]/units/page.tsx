import { UnitsList } from "@/features/units/components/units-list";
import { getUnitsForBuilding } from "@/features/units/queries";
import { requireUser } from "@/lib/auth";

// ABM de unidades (paso 4.3), sobre el listado de solo lectura del paso
// 4.2. `organization.id` sale de requireUser(), que el layout de este
// mismo segmento ya llamó -- cache() de React (ver src/lib/auth.ts) hace
// que esto no repita esa consulta, solo agrega la propia de
// getUnitsForBuilding().
export default async function BuildingUnitsPage({
  params,
}: PageProps<"/panel/buildings/[buildingId]/units">) {
  const { organization } = await requireUser();
  const { buildingId } = await params;

  const units = await getUnitsForBuilding(organization.id, buildingId);

  return <UnitsList buildingId={buildingId} units={units} />;
}
