import { BuildingsList } from "@/features/buildings/components/buildings-list";
import { getManagedBuildings } from "@/features/buildings/queries";
import { requireUser } from "@/lib/auth";

// Listado de gestión de edificios (paso 4.1): usa getManagedBuildings(), no
// getActiveBuildings() -- acá SÍ interesa ver los edificios pausados
// (marcados visualmente por BuildingsList), a diferencia del selector del
// header. Ver CLAUDE.md > Acceso a datos.
export default async function BuildingsPage() {
  const { organization } = await requireUser();
  const buildings = await getManagedBuildings(organization.id);

  return <BuildingsList buildings={buildings} />;
}
