import { notFound } from "next/navigation";
import { z } from "zod";

import { BuildingDetailHeader } from "@/features/buildings/components/building-detail-header";
import { BuildingDetailTabs } from "@/features/buildings/components/building-detail-tabs";
import { getBuildingDetail } from "@/features/buildings/queries";
import { requireUser } from "@/lib/auth";

// Resuelve y autoriza el edificio UNA sola vez para las cinco pestañas
// (paso 4.2): gracias al partial rendering de Next.js, este layout no se
// vuelve a ejecutar al navegar entre pestañas del MISMO edificio (mismo
// buildingId) -- solo corre de nuevo si se entra directo por URL o se
// cambia de edificio. Cada page.tsx de pestaña no vuelve a pedir estos
// datos: solo necesita `buildingId` (que ya le llega en sus propios
// `params`, sin depender de este layout) y `organization.id` (cacheado por
// requireUser(), ver src/lib/auth.ts) para correr su propio listado.
//
// 404, no error crudo (pedido explícito del paso), para dos casos que acá
// se tratan igual a propósito -- no hay forma de que la persona que mira
// la pantalla distinga "no existe" de "no es tuyo", y esa ambigüedad es la
// defensa correcta (confirmar cuáles ids son válidos en otra organización
// sería filtrar información):
// 1. El segmento de la URL no es ni siquiera un uuid válido (alguien
//    escribió algo a mano, o un link roto).
// 2. getBuildingDetail() devuelve null -- el id es un uuid válido pero no
//    hay un edificio con ese id en la organización de quien mira (de otra
//    organización, o borrado con deleted_at) -- ver el filtro exacto en
//    src/features/buildings/queries.ts.
export default async function BuildingDetailLayout({
  children,
  params,
}: LayoutProps<"/panel/buildings/[buildingId]">) {
  const { organization } = await requireUser();
  const { buildingId } = await params;

  const parsedBuildingId = z.uuid().safeParse(buildingId);
  if (!parsedBuildingId.success) {
    notFound();
  }

  const building = await getBuildingDetail(
    organization.id,
    parsedBuildingId.data,
  );
  if (!building) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <BuildingDetailHeader building={building} />
      <BuildingDetailTabs buildingId={building.id} />
      {children}
    </div>
  );
}
