import { notFound } from "next/navigation";
import { z } from "zod";

import { TicketStatusLookupForm } from "@/features/public-form/components/ticket-status-lookup-form";
import { getBuildingByPublicToken } from "@/features/public-form/queries";

// Vía b del paso 11.1: consultar el estado de un reclamo tipeando el
// public_code a mano. Vive bajo /r/[token] (no una ruta nueva y suelta)
// porque el token público del edificio -- la misma credencial de /r/[token]
// -- es lo que resuelve la organización ANTES de mirar el código, tal como
// anticipaba el comentario del UNIQUE tickets_organization_id_public_code
// en el schema ("nunca hace falta una búsqueda ciega global").
//
// Sólo valida que el token resuelva un edificio real (no dado de baja).
// NO bloquea si el edificio está inactivo: "no recibe reclamos NUEVOS" no
// implica "no podés ver los viejos" (decisión propia, ver el reporte). El
// match del código, el rate limit y qué se devuelve viven en la Server
// Action lookupTicketStatusAction -- esta page sólo arma el formulario.
//
// notFound() cae en src/app/r/[token]/not-found.tsx (segmento padre), con
// el mismo mensaje ambiguo de siempre.
export default async function TicketStatusLookupPage({
  params,
}: PageProps<"/r/[token]/estado">) {
  const { token } = await params;

  const parsedToken = z.uuid().safeParse(token);
  if (!parsedToken.success) {
    notFound();
  }

  const building = await getBuildingByPublicToken(parsedToken.data);
  if (!building) {
    notFound();
  }

  return <TicketStatusLookupForm token={parsedToken.data} />;
}
