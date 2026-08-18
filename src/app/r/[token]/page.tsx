import { notFound } from "next/navigation";
import { z } from "zod";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getBuildingByPublicToken } from "@/features/public-form/queries";

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
// 3. Edificio activo -> confirmación mínima. El formulario en sí es el
//    paso 5.2.
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

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-center text-xl">{building.name}</CardTitle>
        <CardDescription className="text-center">
          Encontramos tu edificio. En un toque vas a poder cargar tu reclamo
          desde acá.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
