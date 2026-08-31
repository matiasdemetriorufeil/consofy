import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PublicDocumentList } from "@/features/public-form/components/public-document-list";
import {
  getBuildingByPublicToken,
  getPublicBuildingDocuments,
} from "@/features/public-form/queries";

// Acceso público a los documentos VISIBLES del edificio (paso 11.3), desde
// el mismo link del formulario. Ruta hija de `/r/[token]`, mismo patrón que
// `/r/[token]/estado` (11.1): el `public_token` del edificio es la
// credencial, se resuelve con getBuildingByPublicToken -- EL MISMO
// mecanismo que el formulario, no uno nuevo.
//
// Casos borde: mismo tratamiento que `/r/[token]` (pedido explícito, "no
// inventes un comportamiento distinto acá"):
//  - token mal formado / no resuelve un edificio -> notFound() (cae en
//    src/app/r/[token]/not-found.tsx, mensaje ambiguo).
//  - edificio inactivo -> la misma tarjeta que muestra `/r/[token]` (el
//    texto habla de reclamos, pero se reusa tal cual para no divergir).
//
// A diferencia de `/r/[token]/estado`, acá SÍ se bloquea si el edificio
// está inactivo -- porque `/r/[token]` lo hace y el enunciado pide igualar
// ese comportamiento.
export default async function PublicBuildingDocumentsPage({
  params,
}: PageProps<"/r/[token]/documentos">) {
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

  const documents = await getPublicBuildingDocuments(
    building.id,
    building.organizationId,
  );

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div className="text-center">
        <h1 className="text-ink font-display text-xl font-semibold">
          Documentos de {building.name}
        </h1>
        <p className="text-ink-muted text-sm">
          Reglamentos, actas y otros archivos que compartió tu administración.
        </p>
      </div>

      <PublicDocumentList token={parsedToken.data} documents={documents} />

      <p className="text-center">
        <Link
          href={`/r/${parsedToken.data}`}
          className="text-ink-muted text-sm underline underline-offset-4"
        >
          Volver
        </Link>
      </p>
    </div>
  );
}
