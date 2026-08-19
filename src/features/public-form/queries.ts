import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import {
  buildings,
  categories,
  organizations,
  people,
  ticketAttachments,
  tickets,
  units,
} from "@/db/schema";

export type PublicBuilding = {
  id: string;
  organizationId: string;
  name: string;
  active: boolean;
  // Necesario del lado del cliente recién desde el paso 5.8 (armar el link
  // `wa.me` con buildWhatsAppUrl, src/lib/whatsapp-url.ts) -- exponerlo acá
  // no es una filtración nueva: el flujo entero de este proyecto depende de
  // que ESTE número termine visible en la URL que el propio vecino abre
  // (ver CLAUDE.md > Qué es este proyecto), así que ya iba a viajar al
  // navegador en cuanto se tocara el botón. Traerlo antes, como prop, solo
  // adelanta ese momento.
  adminWhatsappE164: string;
};

// ÚNICA excepción del proyecto al patrón "organizationId es siempre el
// primer parámetro" (ver CLAUDE.md > Acceso a datos): esta query es la que
// RESUELVE la organización, no una que ya la conoce -- no hay ningún
// `organizationId` que un caller pueda pasar, porque el único dato que
// trae un vecino sin sesión es el token de la URL. `public_token` hace de
// credencial acá (por eso es único de forma GLOBAL, no por organización --
// ver src/db/schema/buildings.ts): conocer el token entero es lo único que
// autoriza a ver este edificio, no pertenecer a ninguna organización.
//
// Filtra `deleted_at IS NULL` en la query misma, no en el caller: un
// edificio dado de baja tiene que comportarse EXACTAMENTE igual que un
// token que nunca existió (pedido explícito del paso 5.1) -- que el propio
// `null` que devuelve esta función no distinga los dos casos es lo que
// hace estructuralmente imposible filtrar ese detalle por error en algún
// lugar más arriba. `active` SÍ se devuelve (no se filtra acá): un
// edificio inactivo es un caso distinto a propósito, con su propia
// pantalla -- ver src/app/r/[token]/page.tsx.
//
// cache() de React: no hay un segundo caller hoy (paso 5.1 es una sola
// page.tsx, sin layout con lógica), pero el paso 5.2 (el formulario) va a
// necesitar resolver el mismo token para las categorías/unidades del
// edificio -- cachear ahora evita un round-trip de más apenas ese paso
// reutilice esta función en la misma request.
export const getBuildingByPublicToken = cache(
  async function getBuildingByPublicToken(
    token: string,
  ): Promise<PublicBuilding | null> {
    const [row] = await db
      .select({
        id: buildings.id,
        organizationId: buildings.organizationId,
        name: buildings.name,
        active: buildings.active,
        adminWhatsappE164: buildings.adminWhatsappE164,
      })
      .from(buildings)
      .where(
        and(eq(buildings.publicToken, token), isNull(buildings.deletedAt)),
      );

    return row ?? null;
  },
);

export type PublicFormCategory = {
  id: string;
  name: string;
};

// Categorías del paso 2 del formulario (paso 5.2). Mismo criterio que
// getActiveBuildings() (CLAUDE.md > Acceso a datos, "selectores que
// alimentan una carga NUEVA"): active = true AND deleted_at IS NULL -- una
// categoría oculta u ordenada por el administrador no debe ofrecerse acá,
// aunque reclamos viejos sigan referenciándola.
//
// organizationId, no buildingId: categories es de organización, no de
// edificio (ver src/db/schema/categories.ts) -- todos los edificios de una
// misma organización comparten el mismo set de categorías.
export const getActiveCategoriesForBuilding = cache(
  async function getActiveCategoriesForBuilding(
    organizationId: string,
  ): Promise<PublicFormCategory[]> {
    return db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(
        and(
          eq(categories.organizationId, organizationId),
          eq(categories.active, true),
          isNull(categories.deletedAt),
        ),
      )
      .orderBy(asc(categories.sortOrder), asc(categories.name));
  },
);

export type TicketCategory = {
  id: string;
  defaultPriority: (typeof categories.$inferSelect)["defaultPriority"];
};

// Validación server-side de la categoría al confirmar un reclamo (paso
// 5.5): a diferencia de getActiveCategoriesForBuilding() (que alimenta el
// PICKER), acá NO se filtra por `active` -- el vecino pudo haber elegido la
// categoría un rato antes de que un administrador la ocultara del picker;
// eso no debería tirar abajo un reclamo ya en curso. `deleted_at IS NULL`
// SÍ se exige: una categoría borrada de verdad no es un destino válido para
// un reclamo NUEVO, sin importar qué haya elegido el cliente. También trae
// `defaultPriority`, que es de donde sale la prioridad real del reclamo
// (paso 5.2: "sin campo de prioridad en el formulario, sale de la
// categoría").
export async function getCategoryForTicket(
  organizationId: string,
  categoryId: string,
): Promise<TicketCategory | null> {
  const [row] = await db
    .select({ id: categories.id, defaultPriority: categories.defaultPriority })
    .from(categories)
    .where(
      and(
        eq(categories.id, categoryId),
        eq(categories.organizationId, organizationId),
        isNull(categories.deletedAt),
      ),
    );

  return row ?? null;
}

export type TicketAttachmentFile = {
  id: string;
  storagePath: string;
  mimeType: string;
  originalFilename: string;
};

export type TicketGallery = {
  publicCode: string;
  description: string;
  reportedAt: Date;
  buildingName: string;
  organizationTimezone: string;
  unitLabel: string;
  categoryName: string;
  neighborName: string;
  attachments: TicketAttachmentFile[];
};

// Resuelve el reclamo detrás de un token de adjuntos (paso 5.10,
// `/s/[token]`) -- MISMO patrón que getBuildingByPublicToken: el token es
// la ÚNICA credencial, la organización y el edificio salen DE ACÁ, nunca
// de nada que el caller pase. `attachments_token` es único de forma
// GLOBAL (ver `src/db/schema/tickets.ts`, mismo criterio que
// `buildings.public_token`), así que no hace falta ningún otro dato para
// resolver la fila sin ambigüedad.
//
// Filtra reclamo Y edificio no dados de baja -- ver el análisis de
// seguridad del reporte del paso 5.10 ("un reclamo cuyo edificio fue dado
// de baja"): un edificio que se fue del sistema no debería seguir
// exponiendo fotos de sus reclamos viejos por este link, aunque los
// reclamos en sí sigan existiendo (el soft-delete de un edificio NO borra
// en cascada sus reclamos -- la FK es RESTRICT, no CASCADE, así que esta
// combinación es un caso real, no hipotético). Mismo criterio de
// ambigüedad que `/r/[token]`: no hay una pantalla distinta para "el
// edificio de este reclamo está dado de baja", cae al mismo 404 que un
// token inválido.
export async function getTicketByAttachmentsToken(
  token: string,
): Promise<TicketGallery | null> {
  const [row] = await db
    .select({
      id: tickets.id,
      publicCode: tickets.publicCode,
      description: tickets.description,
      reportedAt: tickets.reportedAt,
      unitLabelRaw: tickets.unitLabelRaw,
      buildingName: buildings.name,
      organizationTimezone: organizations.timezone,
      categoryName: categories.name,
      neighborFirstName: people.firstName,
      neighborLastName: people.lastName,
      unitTower: units.tower,
      unitFloor: units.floor,
      unitNumber: units.number,
    })
    .from(tickets)
    .innerJoin(buildings, eq(tickets.buildingId, buildings.id))
    .innerJoin(organizations, eq(buildings.organizationId, organizations.id))
    .innerJoin(categories, eq(tickets.categoryId, categories.id))
    .leftJoin(people, eq(tickets.personId, people.id))
    .leftJoin(units, eq(tickets.unitId, units.id))
    .where(
      and(
        eq(tickets.attachmentsToken, token),
        isNull(tickets.deletedAt),
        isNull(buildings.deletedAt),
      ),
    );

  if (!row) {
    return null;
  }

  // Misma fórmula que formatUnitLabel (unit-combobox.tsx) para una unidad
  // real elegida de la lista; texto libre tal cual si el vecino no la
  // encontró (ver el CHECK tickets_unit_id_or_label_present -- siempre
  // hay uno de los dos). Se repite acá en vez de importar esa función
  // porque vive en un componente "use client" -- duplicar dos líneas es
  // más simple que sacarla de ahí para un único consumidor nuevo del lado
  // del servidor.
  const unitLabel = row.unitTower
    ? `${row.unitTower} - ${row.unitFloor}°${row.unitNumber}`
    : row.unitFloor && row.unitNumber
      ? `${row.unitFloor}°${row.unitNumber}`
      : (row.unitLabelRaw ?? "");

  const neighborName = [row.neighborFirstName, row.neighborLastName]
    .filter(Boolean)
    .join(" ");

  const attachments = await db
    .select({
      id: ticketAttachments.id,
      storagePath: ticketAttachments.storagePath,
      mimeType: ticketAttachments.mimeType,
      originalFilename: ticketAttachments.originalFilename,
    })
    .from(ticketAttachments)
    .where(eq(ticketAttachments.ticketId, row.id))
    .orderBy(asc(ticketAttachments.createdAt));

  return {
    publicCode: row.publicCode,
    description: row.description,
    reportedAt: row.reportedAt,
    buildingName: row.buildingName,
    organizationTimezone: row.organizationTimezone,
    unitLabel,
    categoryName: row.categoryName,
    neighborName,
    attachments,
  };
}
