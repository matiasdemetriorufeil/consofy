import "server-only";

import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import { buildings, tickets, units } from "@/db/schema";

export type ActiveBuildingOption = {
  id: string;
  name: string;
};

export type ManagedBuildingOption = {
  id: string;
  name: string;
  slug: string;
  codePrefix: string;
  address: string;
  city: string;
  adminWhatsappE164: string;
  notes: string | null;
  active: boolean;
  unitsCount: number;
  pendingTicketsCount: number;
};

// Mismo criterio que PENDING_STATUSES en src/features/tickets/queries.ts
// (no exportado desde ahí -- ver el comentario de getManagedBuildings más
// abajo sobre por qué este archivo no importa ese módulo).
const PENDING_TICKET_STATUSES = ["new", "in_progress"] as const;

// Primera consulta real de datos del panel -- el patrón que siguen todas
// las que vengan después (ver CLAUDE.md > Acceso a datos): SIEMPRE filtra
// por organización (nunca se confía en que el llamador ya filtró), SIEMPRE
// excluye lo borrado. `organizationId` es un parámetro obligatorio, no
// opcional con un default "traer todo" -- no existe una forma de llamar a
// esta función y obtener edificios de más de una organización.
//
// Para SELECTORES QUE ALIMENTAN UNA CARGA NUEVA: selector de edificio del
// header, categorías del formulario público de reclamos. Filtra por
// `active = true` ADEMÁS de `deleted_at IS NULL` -- ver CLAUDE.md > Acceso
// a datos sobre por qué son dos ejes distintos (uno es "se fue del
// sistema", el otro es "pausado, pero su historial se sigue viendo"). Un
// edificio con contrato de administración terminado (`active = false`)
// sigue existiendo para consultar reclamos viejos, pero no tiene que
// aparecer acá: no se le puede cargar un reclamo NUEVO.
//
// Si necesitás la lista completa para gestión/historial/reportes (que SÍ
// debe incluir los inactivos), usá getManagedBuildings() más abajo, no
// esta.
//
// cache() de React: el layout de /panel (para el selector del header) y el
// dashboard de inicio (paso 3.5, para decidir si hay algún edificio activo
// antes de mostrar las tarjetas) llaman a esta misma función en la misma
// request -- sin cache(), eso son dos round-trips idénticos a la base en
// vez de uno.
export const getActiveBuildings = cache(async function getActiveBuildings(
  organizationId: string,
): Promise<ActiveBuildingOption[]> {
  return db
    .select({ id: buildings.id, name: buildings.name })
    .from(buildings)
    .where(
      and(
        eq(buildings.organizationId, organizationId),
        eq(buildings.active, true),
        isNull(buildings.deletedAt),
      ),
    )
    .orderBy(asc(buildings.name));
});

// Para LISTADOS DE GESTIÓN, HISTORIAL Y REPORTES: acá SÍ importa poder ver
// un edificio pausado (`active = false`), porque se sigue consultando lo
// que pasó ahí -- solo se excluye lo borrado (`deleted_at`, la papelera).
// Devuelve `active` para que la UI que consuma esto pueda marcar
// visualmente los inactivos en vez de esconderlos (ver CLAUDE.md > Acceso
// a datos).
//
// Si necesitás la lista para un selector que alimenta una carga nueva
// (edificio activo elegible para un reclamo nuevo, por ejemplo), usá
// getActiveBuildings() de arriba, no esta.
//
// Paso 4.1: esta es la query real del listado de gestión de edificios --
// trae TODAS las columnas editables (no solo las de columna visible en la
// tabla) para que el diálogo de edición precargue el formulario con la fila
// que ya está en memoria en el cliente, sin un segundo round-trip a pedir
// "el edificio completo" recién al abrir el diálogo. Además de eso, dos
// conteos (unidades, reclamos pendientes). Cuidado con el N+1 (pedido
// explícito del paso): los conteos NO se piden con una query por edificio
// -- eso es una consulta por fila, invisible con 3 edificios de prueba pero
// real en producción. En cambio, se arman como DOS subconsultas agregadas
// (GROUP BY building_id), cada una una sola vuelta a su tabla, y se pegan
// con LEFT JOIN sobre buildings -- misma técnica que getAttentionTickets()
// en tickets/queries.ts. Un JOIN directo de buildings contra units Y
// tickets a la vez (sin subconsultar primero) multiplicaría filas de forma
// cruzada -- N unidades x M reclamos del mismo edificio -- y un count(*)
// sobre eso quedaría mal.
//
// Reclamos pendientes: mismo set de estados ("new", "in_progress") que
// PENDING_STATUSES en tickets/queries.ts. No se importa esa constante
// porque no está exportada (es un detalle interno de ese módulo) y porque
// buildings/queries.ts no depende de tickets/queries.ts -- se redeclara acá
// como PENDING_TICKET_STATUSES, misma idea que building/tickets ya
// comparten cruzando tablas en getTicketSummaryByBuilding().
export async function getManagedBuildings(
  organizationId: string,
): Promise<ManagedBuildingOption[]> {
  const unitCounts = db
    .select({
      buildingId: units.buildingId,
      unitsCount: sql<number>`count(*)`.mapWith(Number).as("units_count"),
    })
    .from(units)
    .where(isNull(units.deletedAt))
    .groupBy(units.buildingId)
    .as("unit_counts");

  const pendingTicketCounts = db
    .select({
      buildingId: tickets.buildingId,
      pendingTicketsCount: sql<number>`count(*)`
        .mapWith(Number)
        .as("pending_tickets_count"),
    })
    .from(tickets)
    .where(
      and(
        inArray(tickets.status, PENDING_TICKET_STATUSES),
        isNull(tickets.deletedAt),
      ),
    )
    .groupBy(tickets.buildingId)
    .as("pending_ticket_counts");

  return db
    .select({
      id: buildings.id,
      name: buildings.name,
      slug: buildings.slug,
      codePrefix: buildings.codePrefix,
      address: buildings.address,
      city: buildings.city,
      adminWhatsappE164: buildings.adminWhatsappE164,
      notes: buildings.notes,
      active: buildings.active,
      unitsCount: sql<number>`coalesce(${unitCounts.unitsCount}, 0)`.mapWith(
        Number,
      ),
      pendingTicketsCount:
        sql<number>`coalesce(${pendingTicketCounts.pendingTicketsCount}, 0)`.mapWith(
          Number,
        ),
    })
    .from(buildings)
    .leftJoin(unitCounts, eq(unitCounts.buildingId, buildings.id))
    .leftJoin(
      pendingTicketCounts,
      eq(pendingTicketCounts.buildingId, buildings.id),
    )
    .where(
      and(
        eq(buildings.organizationId, organizationId),
        isNull(buildings.deletedAt),
      ),
    )
    .orderBy(asc(buildings.name));
}

// Usada en dos lugares: la validación en vivo del formulario (punto 2 del
// paso) y la traducción del error de Postgres cuando la carrera entre el
// chequeo en vivo y el INSERT/UPDATE real hace que el índice único
// (buildings_organization_id_code_prefix_unique) rechace la escritura de
// todos modos -- ver actions.ts. Devuelve el edificio QUE YA lo usa (no
// solo un booleano) porque el mensaje de error pedido tiene que mencionar
// cuál es ("Prefijo duplicado: mencionando cuál lo usa").
//
// `excludeBuildingId`: al editar, el propio edificio no cuenta como
// conflicto contra sí mismo.
export async function findBuildingByCodePrefix(
  organizationId: string,
  codePrefix: string,
  excludeBuildingId?: string,
): Promise<{ id: string; name: string } | null> {
  const [row] = await db
    .select({ id: buildings.id, name: buildings.name })
    .from(buildings)
    .where(
      and(
        eq(buildings.organizationId, organizationId),
        eq(buildings.codePrefix, codePrefix),
        isNull(buildings.deletedAt),
        excludeBuildingId ? ne(buildings.id, excludeBuildingId) : undefined,
      ),
    );

  return row ?? null;
}
