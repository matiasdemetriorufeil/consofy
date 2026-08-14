import { redirect } from "next/navigation";

// /panel/buildings/[buildingId] a secas no renderiza nada propio -- redirige
// a la primera pestaña (paso 4.2, punto 3: "Unidades" es la primera de las
// cinco). No hace falta resolver el edificio acá: el layout de este mismo
// segmento ya lo hace (y ya tira notFound() si no corresponde) antes de que
// esta redirección importe.
export default async function BuildingDetailIndexPage({
  params,
}: PageProps<"/panel/buildings/[buildingId]">) {
  const { buildingId } = await params;
  redirect(`/panel/buildings/${buildingId}/units`);
}
