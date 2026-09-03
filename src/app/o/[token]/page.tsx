import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import {
  getActiveBuildingsForOrganization,
  getOrganizationByPublicToken,
} from "@/features/public-form/queries";

// Ruta pública, sin sesión (paso 17.1) -- la página intermedia entre "el
// vecino le escribió al administrador por WhatsApp" y "el vecino carga su
// reclamo". El administrador usa UN solo número de WhatsApp para varios
// edificios, así que desde ese chat no hay forma de mandar al vecino al
// formulario correcto. Este link -- que el administrador deja como
// respuesta automática de WhatsApp Business, o pega a mano -- lo trae acá,
// y acá elige su edificio.
//
// Vive en `/o/[token]`: una sola letra, igual que `/r/[token]` (reclamo de
// un edificio) y `/s/[token]` (seguimiento de un reclamo). `o` =
// organización, y es literal: el token que resuelve esta ruta es el
// `public_token` de una ORGANIZACIÓN (organizations.public_token, paso
// 17.1), tal como el de `/r` resuelve un edificio y el de `/s` un reclamo.
//
// Todo se valida y resuelve en el servidor antes de mostrar nada, sin
// asumir que el valor de la URL es válido -- mismo criterio que el resto de
// la superficie pública. Dos resultados posibles:
//
// 1. Token mal formado, inexistente, o de OTRO tipo (ej. el public_token de
//    un edificio pasado por error a esta ruta) -> notFound(), que cae en
//    src/app/o/[token]/not-found.tsx con el MISMO mensaje ambiguo que
//    `/r/[token]` y `/s/[token]`: no se distingue "no existe" de "no tenés
//    acceso". Un token de edificio simplemente no matchea ninguna fila en
//    getOrganizationByPublicToken -> `null` -> el mismo 404.
// 2. Token válido -> la lista de edificios ACTIVOS de la organización, cada
//    uno con un link directo a su formulario público (`/r/[token del
//    edificio]`). Los edificios inactivos (`active = false`) o dados de
//    baja (`deleted_at`) NO se listan: no se les puede cargar un reclamo
//    nuevo. Si no hay ningún edificio activo, se muestra un mensaje honesto,
//    NO un 404 -- el token ya autorizó a esta persona a ver esta pantalla,
//    igual que `/s/[token]` con un reclamo sin fotos.
//
// El nombre de la organización SÍ se muestra: llegar hasta acá requiere un
// `public_token` real y vigente (uuid aleatorio, no adivinable), así que
// confirmarle a quien ya lo tiene que está en el lugar correcto es útil, no
// una divulgación nueva -- mismo criterio que `/r/[token]` con el nombre
// del edificio (ver CLAUDE.md > Auditoría de la superficie pública, punto
// f.1).
export default async function OrganizationBuildingsPage({
  params,
}: PageProps<"/o/[token]">) {
  const { token } = await params;

  const parsedToken = z.uuid().safeParse(token);
  if (!parsedToken.success) {
    notFound();
  }

  const organization = await getOrganizationByPublicToken(parsedToken.data);
  if (!organization) {
    notFound();
  }

  const buildings = await getActiveBuildingsForOrganization(organization.id);

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div className="text-center">
        <h1 className="text-ink font-display text-xl font-semibold">
          {organization.name}
        </h1>
        <p className="text-ink-muted text-sm">
          Elegí tu edificio para cargar un reclamo.
        </p>
      </div>

      {buildings.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {buildings.map((building) => (
            <li key={building.publicToken}>
              <Link
                href={`/r/${building.publicToken}`}
                className="border-border bg-surface text-ink hover:bg-canvas focus-visible:ring-ring/50 flex items-center justify-between gap-3 rounded-lg border p-3 text-sm font-medium transition-colors outline-none focus-visible:ring-3"
              >
                {building.name}
                <span aria-hidden="true" className="text-ink-muted">
                  &rarr;
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-muted border-border rounded-lg border border-dashed p-3 text-center text-sm">
          Esta administración todavía no tiene edificios disponibles para cargar
          reclamos. Comunicate directo con tu administración.
        </p>
      )}
    </div>
  );
}
