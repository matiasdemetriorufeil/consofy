import { NextResponse } from "next/server";

import { getBuildingPublicUrl } from "@/features/buildings/public-link";
import { generateQrPngBuffer } from "@/features/buildings/qr-code";
import { getBuildingDetail } from "@/features/buildings/queries";
import { requireUser } from "@/lib/auth";

// Descarga del QR en PNG de alta resolución (paso 4.6). Route Handler, no
// Server Action: una descarga de archivo es una respuesta HTTP con
// Content-Disposition, no algo que una Server Action pueda devolver.
//
// Resuelve su PROPIA autorización con requireUser() en vez de confiar en
// el layout de esta misma ruta -- ver CLAUDE.md > Autorización de rutas y
// Server Actions: un Route Handler es un endpoint HTTP invocable directo,
// sin pasar nunca por el layout de la página desde la que se linkea acá.
// requireUser() redirige a /login si no hay sesión -- comportamiento
// correcto para este caso (se llega acá solo por una navegación real del
// navegador, con el botón "Descargar QR" de la pantalla).
//
// 404 (no un error crudo) si el edificio no existe o no es de la
// organización de quien pide -- mismo criterio de "no distinguir ambos
// casos" que ya usa el layout del segmento (ver ese archivo).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ buildingId: string }> },
) {
  const { organization } = await requireUser();
  const { buildingId } = await params;

  const building = await getBuildingDetail(organization.id, buildingId);
  if (!building) {
    return new NextResponse("No encontrado", { status: 404 });
  }

  const publicUrl = getBuildingPublicUrl(building.publicToken);
  const png = await generateQrPngBuffer(publicUrl);

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="consorfy-qr-${building.slug}.png"`,
      "Cache-Control": "no-store",
    },
  });
}
