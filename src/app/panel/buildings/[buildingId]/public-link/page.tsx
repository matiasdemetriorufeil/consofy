import { notFound } from "next/navigation";

import { PublicLinkPanel } from "@/features/buildings/components/public-link-panel";
import {
  buildWhatsappAutoReplyMessage,
  getBuildingPublicUrl,
} from "@/features/buildings/public-link";
import { generateQrSvgDataUrl } from "@/features/buildings/qr-code";
import { getBuildingDetail } from "@/features/buildings/queries";
import { requireUser } from "@/lib/auth";

// Enlace público del edificio (paso 4.6): todo lo que el administrador
// necesita para que sus vecinos empiecen a cargar reclamos -- el enlace en
// sí, su QR y el texto sugerido para la respuesta automática de WhatsApp
// Business. La ruta pública que este enlace señala (/r/[token]) todavía NO
// existe -- la crea el paso 5.1 -- así que abrirlo hoy da 404. Eso es
// esperado en este paso: acá solo se genera y se muestra.
//
// Pestaña, no diálogo (decisión del paso 4.6): esta pantalla se usa poco
// (una vez por edificio, al arrancar), pero el resto del detalle de
// edificio ya resuelve exactamente ese trade-off con una pestaña más --
// agregar un mecanismo de descubrimiento distinto (un botón suelto en el
// header, un diálogo) solo para esta pantalla habría sido una segunda
// convención de navegación conviviendo con la que ya usan las otras cinco
// pestañas (ver building-detail-tabs.tsx), sin necesidad real: "se usa
// poco" no es lo mismo que "hay que esconderla" -- sigue siendo lo primero
// que un administrador nuevo necesita para poner en marcha un edificio.
//
// getBuildingDetail(organization.id, buildingId): el layout de este mismo
// segmento (src/app/panel/buildings/[buildingId]/layout.tsx) ya llamó a
// esta misma función con los mismos argumentos para el encabezado y ya
// hizo notFound() si no existía -- cache() de React (ver el comentario de
// getBuildingDetail en queries.ts) hace que esta segunda llamada no repita
// el round-trip. El notFound() de acá abajo es día-a-día inalcanzable
// (si llegamos hasta acá, el layout ya validó que existe), pero el tipo de
// retorno sigue siendo `BuildingDetailFields | null` -- se maneja
// explícitamente en vez de asumir con un `!` que nunca va a pasar.
export default async function BuildingPublicLinkPage({
  params,
}: PageProps<"/panel/buildings/[buildingId]/public-link">) {
  const { organization } = await requireUser();
  const { buildingId } = await params;

  const building = await getBuildingDetail(organization.id, buildingId);
  if (!building) {
    notFound();
  }

  const publicUrl = getBuildingPublicUrl(building.publicToken);
  const whatsappMessage = buildWhatsappAutoReplyMessage(
    building.name,
    publicUrl,
  );
  const qrPreviewSrc = await generateQrSvgDataUrl(publicUrl);

  return (
    <PublicLinkPanel
      buildingId={building.id}
      active={building.active}
      publicUrl={publicUrl}
      whatsappMessage={whatsappMessage}
      qrPreviewSrc={qrPreviewSrc}
    />
  );
}
