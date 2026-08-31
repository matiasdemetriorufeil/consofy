import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TicketForm } from "@/features/public-form/components/ticket-form";
import {
  getActiveCategoriesForBuilding,
  getBuildingByPublicToken,
} from "@/features/public-form/queries";
import { getUnitsForBuilding } from "@/features/units/queries";
import { env } from "@/lib/env";

// Ruta pública, sin sesión (paso 5.1) -- la única superficie de la app
// abierta a internet sin autenticación (ver CLAUDE.md > Qué es este
// proyecto). Todo lo que llega acá es de un vecino cualquiera, parado en
// un pasillo con el celular: valida y resuelve TODO en el servidor antes
// de mostrar nada, sin asumir que el valor de la URL es válido.
//
// Tres resultados posibles, cada uno con su propia pantalla:
// 1. Token mal formado, inexistente, o edificio dado de baja -> notFound()
//    -- ver src/app/r/[token]/not-found.tsx. Los tres casos se tratan
//    IGUAL a propósito (ver el análisis de seguridad del reporte de este
//    paso): no hay forma de que quien mira la pantalla distinga "nunca
//    existió" de "existió y se dio de baja", y esa ambigüedad es la
//    defensa correcta -- confirmar que un token FUE válido alguna vez es
//    información de más para cualquiera que no sea el propio vecino.
// 2. Edificio activo=false -> pantalla propia, explica la pausa. Acá SÍ
//    se muestra el nombre: a diferencia del caso 1, quien llegó hasta acá
//    ya tiene un token real y vigente (no adivinado -- ver el análisis de
//    seguridad), así que confirmarle que está en el edificio correcto es
//    útil, no un riesgo nuevo.
// 3. Edificio activo -> el formulario de reclamos en pasos (paso 5.2).
//    Categorías y unidades se piden acá (Server Component) y bajan como
//    props al Client Component -- TicketForm no hace ningún fetch propio,
//    mismo criterio de "el server resuelve, el cliente solo interactúa"
//    que el resto del panel.
export default async function PublicBuildingPage({
  params,
}: PageProps<"/r/[token]">) {
  const { token } = await params;

  const parsedToken = z.uuid().safeParse(token);
  if (!parsedToken.success) {
    notFound();
  }

  const building = await getBuildingByPublicToken(parsedToken.data);
  if (!building) {
    notFound();
  }

  if (!building.active) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-center text-xl">{building.name}</CardTitle>
          <CardDescription className="text-center">
            Este edificio no está recibiendo reclamos por acá por ahora.
            Comunicate directo con tu administración.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const [categories, units] = await Promise.all([
    getActiveCategoriesForBuilding(building.organizationId),
    getUnitsForBuilding(building.organizationId, building.id),
  ]);

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div className="text-center">
        <h1 className="text-ink font-display text-xl font-semibold">
          {building.name}
        </h1>
        <p className="text-ink-muted text-sm">
          Contanos qué pasó y se lo pasamos a tu administración.
        </p>
      </div>
      <TicketForm
        token={parsedToken.data}
        buildingName={building.name}
        adminWhatsappE164={building.adminWhatsappE164}
        appBaseUrl={env.NEXT_PUBLIC_APP_URL}
        categories={categories}
        units={units}
      />
      <p className="text-ink-muted text-center text-sm">
        ¿Ya cargaste uno?{" "}
        <Link
          href={`/r/${parsedToken.data}/estado`}
          className="text-primary underline underline-offset-4"
        >
          Consultá su estado
        </Link>
      </p>
    </div>
  );
}
