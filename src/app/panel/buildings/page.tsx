import { notFound } from "next/navigation";

import { BuildingsList } from "@/features/buildings/components/buildings-list";
import { getManagedBuildings } from "@/features/buildings/queries";
import { OrganizationPublicLinkCard } from "@/features/organizations/components/organization-public-link-card";
import { getOrganizationPublicUrl } from "@/features/organizations/public-link";
import { getOrganizationPublicToken } from "@/features/organizations/queries";
import { requireUser } from "@/lib/auth";

// Listado de gestión de edificios (paso 4.1): usa getManagedBuildings(), no
// getActiveBuildings() -- acá SÍ interesa ver los edificios pausados
// (marcados visualmente por BuildingsList), a diferencia del selector del
// header. Ver CLAUDE.md > Acceso a datos.
//
// Paso 17.2: arriba del listado se muestra el enlace de /o/[token] a nivel
// de organización (paso 17.1). Va acá, y no en Configuración ni en la
// pestaña de enlace público de un edificio, porque es la contracara a
// nivel organización de esa pestaña: el mismo tipo de dato ("el enlace que
// le paso a los vecinos"), pero para toda la administración en vez de un
// edificio puntual -- y esta pantalla ya es donde se gestionan todos los
// edificios que ese enlace lista.
export default async function BuildingsPage() {
  const { organization } = await requireUser();

  const [buildings, publicToken] = await Promise.all([
    getManagedBuildings(organization.id),
    getOrganizationPublicToken(organization.id),
  ]);

  // organizations.public_token es NOT NULL desde el paso 17.1, así que esto
  // es inalcanzable en la práctica (la organización ya la resolvió
  // requireUser()); se maneja explícito en vez de asumir con un `!`, mismo
  // criterio que la pestaña de enlace público de un edificio.
  if (!publicToken) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <OrganizationPublicLinkCard
        publicUrl={getOrganizationPublicUrl(publicToken)}
      />
      <BuildingsList buildings={buildings} />
    </div>
  );
}
