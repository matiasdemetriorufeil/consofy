import "server-only";

import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import {
  buildings,
  categories,
  documents,
  organizations,
  people,
  ticketAttachments,
  ticketEvents,
  tickets,
  units,
} from "@/db/schema";

import {
  PUBLIC_TIMELINE_EVENT_TYPES,
  type PublicTimelineEventRow,
} from "./public-timeline";
import type { PublicTicketStatus } from "./status-lookup-schema";

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

export type PublicOrganization = {
  id: string;
  name: string;
};

// Resuelve la organización detrás del token público de `/o/[token]` (paso
// 17.1) -- MISMO patrón que getBuildingByPublicToken de arriba: el token es
// la ÚNICA credencial, no hay ningún `organizationId` que un caller pueda
// pasar, porque el único dato que trae un vecino sin sesión es el token de
// la URL. `organizations.public_token` es único de forma GLOBAL (ver
// src/db/schema/organizations.ts, mismo criterio que
// `buildings.public_token`), así que basta para resolver la fila sin
// ambigüedad. Un token de EDIFICIO pasado por error a esta ruta no matchea
// ninguna fila acá -> `null`, y la page cae en el mismo `notFound()`
// ambiguo que `/r/[token]` y `/s/[token]`.
//
// Filtra `deleted_at IS NULL` en la query misma, no en el caller -- mismo
// motivo que getBuildingByPublicToken: que el propio `null` que devuelve
// esta función no distinga "no existe" de "se archivó" hace
// estructuralmente imposible filtrar ese detalle por error más arriba. Hoy
// no hay flujo que archive una organización (single-tenant), pero el
// filtro va igual, por consistencia con el resto de la superficie pública.
//
// cache() de React: mismo criterio que getBuildingByPublicToken -- la page
// de `/o/[token]` la llama una vez, pero cachear ahora evita un
// round-trip de más si un layout o un paso futuro reusa esta función en la
// misma request.
export const getOrganizationByPublicToken = cache(
  async function getOrganizationByPublicToken(
    token: string,
  ): Promise<PublicOrganization | null> {
    const [row] = await db
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(
        and(
          eq(organizations.publicToken, token),
          isNull(organizations.deletedAt),
        ),
      );

    return row ?? null;
  },
);

export type PublicOrganizationBuilding = {
  name: string;
  publicToken: string;
};

// Edificios que la página `/o/[token]` (paso 17.1) le ofrece al vecino para
// elegir el suyo. MISMO filtro que getActiveBuildings() (CLAUDE.md >
// Acceso a datos, "selectores que alimentan una carga NUEVA"):
// `active = true AND deleted_at IS NULL` -- un edificio pausado o dado de
// baja no es un destino válido para un reclamo NUEVO, que es lo único que
// esta página inicia.
//
// Función aparte de getActiveBuildings() (src/features/buildings/
// queries.ts) en vez de sumarle una columna: aquella alimenta el selector
// de edificio del header del panel, que no necesita `public_token` --
// mismo criterio que ya separa BuildingEditableFields de
// BuildingDetailFields en ese archivo. Acá se devuelve `public_token`
// porque es lo que arma el link a `/r/[token]` de cada edificio; NO se
// devuelve `id` (la página no lo usa).
//
// `organizationId` primero, obligatorio, sin default -- igual que el resto
// de las queries por organización. El caller (la page) lo pasa ya resuelto
// por getOrganizationByPublicToken en la misma request; esta función nunca
// resuelve su propia autorización.
export async function getActiveBuildingsForOrganization(
  organizationId: string,
): Promise<PublicOrganizationBuilding[]> {
  return db
    .select({ name: buildings.name, publicToken: buildings.publicToken })
    .from(buildings)
    .where(
      and(
        eq(buildings.organizationId, organizationId),
        eq(buildings.active, true),
        isNull(buildings.deletedAt),
      ),
    )
    .orderBy(asc(buildings.name));
}

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
  name: string;
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
// categoría"). Y `name` (paso 14.2): el texto que se manda a la API de
// embeddings es `{categoría}\n\n{descripción}` -- ver
// composeTicketEmbeddingText.
export async function getCategoryForTicket(
  organizationId: string,
  categoryId: string,
): Promise<TicketCategory | null> {
  const [row] = await db
    .select({
      id: categories.id,
      name: categories.name,
      defaultPriority: categories.defaultPriority,
    })
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
  // title/status se suman en el paso 11.1: `/s/[token]` deja de mostrar
  // SOLO las fotos y pasa a confirmar también en qué anda el reclamo (el
  // link ya se llamaba "Ver el estado de tu reclamo" desde el paso 5.8). El
  // asignado y las notas internas siguen AFUERA -- ver el comentario de
  // s/[token]/page.tsx.
  title: string;
  status: (typeof tickets.$inferSelect)["status"];
  description: string;
  reportedAt: Date;
  buildingName: string;
  organizationTimezone: string;
  unitLabel: string;
  categoryName: string;
  neighborName: string;
  attachments: TicketAttachmentFile[];
  // Eventos de `ticket_events` YA filtrados a los tipos seguros para el
  // vecino (paso 11.2, ver public-timeline.ts). Crudos: la página los pasa
  // por buildPublicTimeline para armar el texto. Nunca incluye
  // notas/asignación/prioridad ni nada que nombre a otro reclamo.
  timelineEvents: PublicTimelineEventRow[];
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
// Misma fórmula que formatUnitLabel (unit-combobox.tsx) para una unidad
// real elegida de la lista; texto libre tal cual si el vecino no la
// encontró (ver el CHECK tickets_unit_id_or_label_present -- siempre hay
// uno de los dos). Se repite acá en vez de importar esa función porque vive
// en un componente "use client" -- las dos consultas públicas por token de
// este archivo la usan.
function resolvePublicUnitLabel(row: {
  unitTower: string | null;
  unitFloor: string | null;
  unitNumber: string | null;
  unitLabelRaw: string | null;
}): string {
  return row.unitTower
    ? `${row.unitTower} - ${row.unitFloor}°${row.unitNumber}`
    : row.unitFloor && row.unitNumber
      ? `${row.unitFloor}°${row.unitNumber}`
      : (row.unitLabelRaw ?? "");
}

export async function getTicketByAttachmentsToken(
  token: string,
): Promise<TicketGallery | null> {
  const [row] = await db
    .select({
      id: tickets.id,
      organizationId: tickets.organizationId,
      publicCode: tickets.publicCode,
      title: tickets.title,
      status: tickets.status,
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

  const unitLabel = resolvePublicUnitLabel(row);

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

  // Línea de tiempo pública (paso 11.2) -- SOLO los tipos seguros para el
  // vecino (ver public-timeline.ts). Se filtra en la query, no al
  // renderizar: una nota interna ni siquiera sale de la base por esta vía.
  // Filtra por organización además de por ticket, mismo criterio que
  // getTicketTimeline (el interno del panel).
  const timelineEvents = await db
    .select({
      type: ticketEvents.type,
      payload: ticketEvents.payload,
      createdAt: ticketEvents.createdAt,
    })
    .from(ticketEvents)
    .where(
      and(
        eq(ticketEvents.ticketId, row.id),
        eq(ticketEvents.organizationId, row.organizationId),
        inArray(ticketEvents.type, [...PUBLIC_TIMELINE_EVENT_TYPES]),
      ),
    )
    .orderBy(asc(ticketEvents.createdAt));

  return {
    publicCode: row.publicCode,
    title: row.title,
    status: row.status,
    description: row.description,
    reportedAt: row.reportedAt,
    buildingName: row.buildingName,
    organizationTimezone: row.organizationTimezone,
    unitLabel,
    categoryName: row.categoryName,
    timelineEvents,
    neighborName,
    attachments,
  };
}

// Consulta de estado por public_code TIPEADO A MANO (paso 11.1, la vía
// débil de `/r/[token]/estado`). El `buildingId` NO viene del cliente: lo
// resuelve la Server Action desde el token público del edificio (que ya es
// la credencial de `/r/[token]`), así que acá ya se conoce la organización
// -- exactamente el escenario que anticipaba el comentario del UNIQUE
// `tickets_organization_id_public_code_unique` en el schema ("nunca hace
// falta una búsqueda ciega global"). Se filtra por `building_id` (más
// ajustado todavía que por organización, y el prefijo del código ya es por
// edificio); el UNIQUE por organización garantiza a lo sumo una fila igual.
//
// Devuelve SOLO lo mínimo para confirmar el reclamo (estado, edificio/
// unidad, categoría, fecha) -- NADA de título, descripción, nombre de
// quien reportó, teléfono, fotos ni asignado: quien llega por esta vía
// adivinó (o enumeró) un código corto, no tiene un token no adivinable. El
// título NO se trae -- se deriva de la descripción libre del vecino (ver
// PublicTicketStatus); la categoría cumple la misma función de "¿es este mi
// reclamo?" sin filtrar texto libre. La vista rica (título, descripción)
// sigue detrás de `attachments_token` (`/s/[token]`), que no se entrega por
// acá. `deleted_at IS NULL` en reclamo y edificio, misma ambigüedad de
// siempre para "no existe".
export async function getTicketStatusByPublicCode(
  buildingId: string,
  publicCode: string,
): Promise<PublicTicketStatus | null> {
  const [row] = await db
    .select({
      status: tickets.status,
      reportedAt: tickets.reportedAt,
      unitLabelRaw: tickets.unitLabelRaw,
      buildingName: buildings.name,
      organizationTimezone: organizations.timezone,
      categoryName: categories.name,
      unitTower: units.tower,
      unitFloor: units.floor,
      unitNumber: units.number,
    })
    .from(tickets)
    .innerJoin(buildings, eq(tickets.buildingId, buildings.id))
    .innerJoin(organizations, eq(buildings.organizationId, organizations.id))
    .innerJoin(categories, eq(tickets.categoryId, categories.id))
    .leftJoin(units, eq(tickets.unitId, units.id))
    .where(
      and(
        eq(tickets.buildingId, buildingId),
        eq(tickets.publicCode, publicCode),
        isNull(tickets.deletedAt),
        isNull(buildings.deletedAt),
      ),
    );

  if (!row) {
    return null;
  }

  return {
    status: row.status,
    buildingName: row.buildingName,
    unitLabel: resolvePublicUnitLabel(row),
    categoryName: row.categoryName,
    reportedAt: row.reportedAt,
    organizationTimezone: row.organizationTimezone,
  };
}

export type PublicBuildingDocument = {
  id: string;
  title: string;
  // `documents.category` es `text` (ver el schema) -- se muestra con
  // documentCategoryLabel (paso 10.2, reusado), que cae al valor crudo si
  // algún día hay una categoría fuera de la lista.
  category: string;
};

// Documentos del edificio VISIBLES para los vecinos (paso 11.3), accesibles
// desde `/r/[token]/documentos`. El caller (la page) resuelve el edificio
// con getBuildingByPublicToken -- MISMO mecanismo que el formulario y
// `/r/[token]/estado` -- y pasa `buildingId` + `organizationId` de ese
// edificio ya resuelto; nada de esto viene del cliente.
//
// Tres condiciones, todas obligatorias:
//  - `building_id` = el edificio del token (no otro de la misma org).
//  - `organization_id` = el de ese edificio (defensa cruzada, mismo
//    criterio que el resto del proyecto -- ver CLAUDE.md > Integridad
//    entre organizaciones).
//  - `visibility = 'residents'` -- un documento `private` NO sale de la
//    base por esta vía, ni se filtra al renderizar: no está en el
//    resultado.
// Más `deleted_at IS NULL`. Orden: más nuevo primero, igual que el
// explorador del panel (getDocumentList).
//
// NO trae `storage_path` ni `original_filename`: la descarga pasa por
// getPublicDocumentDownloadUrlAction, que re-resuelve el documento
// server-side con las mismas tres condiciones antes de firmar nada.
export async function getPublicBuildingDocuments(
  buildingId: string,
  organizationId: string,
): Promise<PublicBuildingDocument[]> {
  return db
    .select({
      id: documents.id,
      title: documents.title,
      category: documents.category,
    })
    .from(documents)
    .where(
      and(
        eq(documents.buildingId, buildingId),
        eq(documents.organizationId, organizationId),
        eq(documents.visibility, "residents"),
        isNull(documents.deletedAt),
      ),
    )
    .orderBy(desc(documents.createdAt), desc(documents.id));
}

export type ResidentUpdateTicket = {
  id: string;
  organizationId: string;
  status: (typeof tickets.$inferSelect)["status"];
  // Nombre de quien reportó, para el `actor_label` del evento
  // `resident_update_added` -- snapshot, mismo criterio que el resto de
  // ticket_events. "Vecino" si el reclamo no tiene persona vinculada.
  neighborName: string;
};

// Resuelve el reclamo detrás de un `attachments_token` para que el vecino
// le agregue información/fotos (paso 11.4). MISMO patrón que
// getTicketByAttachmentsToken: el token es la única credencial, y se
// filtra reclamo Y edificio no dados de baja. NO filtra por estado acá --
// devuelve el `status` y la Server Action decide si está "abierto"
// (new/in_progress), para poder dar el mensaje específico de "ya no está
// abierto". `null` si el token no resuelve nada.
export async function getResidentUpdateTicket(
  token: string,
): Promise<ResidentUpdateTicket | null> {
  const [row] = await db
    .select({
      id: tickets.id,
      organizationId: tickets.organizationId,
      status: tickets.status,
      neighborFirstName: people.firstName,
      neighborLastName: people.lastName,
    })
    .from(tickets)
    .innerJoin(buildings, eq(tickets.buildingId, buildings.id))
    .leftJoin(people, eq(tickets.personId, people.id))
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

  return {
    id: row.id,
    organizationId: row.organizationId,
    status: row.status,
    neighborName:
      [row.neighborFirstName, row.neighborLastName].filter(Boolean).join(" ") ||
      "Vecino",
  };
}
