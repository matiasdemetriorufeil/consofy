import { NextResponse } from "next/server";

import { buildTicketsExportCsv } from "@/features/tickets/export-tickets-csv";
import {
  getTicketsForExport,
  resolveTicketInboxFilters,
} from "@/features/tickets/queries";
import {
  normalizeSearchParams,
  ticketInboxSearchParamsSchema,
} from "@/features/tickets/ticket-inbox-schema";
import { requireUser } from "@/lib/auth";
import { formatDateSlug } from "@/lib/format-date";

// Exportación a CSV de la bandeja (paso 6.7). Route Handler, no Server
// Action -- mismo criterio ya usado para la descarga del QR (paso 4.6, ver
// public-link/qr/route.ts): una descarga de archivo es una respuesta HTTP
// con Content-Disposition, no algo que una Server Action pueda devolver
// (una Server Action solo puede devolver el resultado serializado de un
// `<form>`/`useActionState`, no controlar headers de respuesta HTTP).
//
// Resuelve su PROPIA autorización con requireUser(), sin depender del
// layout de /panel -- ver CLAUDE.md > Autorización de rutas y Server
// Actions: un Route Handler es un endpoint HTTP invocable de forma directa
// (¿alguien arma la URL a mano con otro `building`/`status`? -- sigue sin
// importar, ver el punto de seguridad de abajo), sin pasar nunca por ese
// layout.
//
// Aislamiento por organización -- el mismo mecanismo de siempre, no uno
// nuevo: `organization.id` sale de `requireUser()` (la sesión real,
// resuelta server-side), nunca de un parámetro de la URL. Los filtros que
// SÍ vienen de la URL (building/unit/category/...) solo estrechan el WHERE
// -- `getTicketsForExport()` reusa `buildTicketInboxConditions()`, que
// antepone `eq(tickets.organizationId, organizationId)` incondicionalmente
// (ver CLAUDE.md > Acceso a datos). Poner `?building=<uuid-de-otra-org>` no
// filtra nada: `buildingId` es un AND más sobre un conjunto ya acotado a
// ESTA organización, nunca un reemplazo de ese filtro -- un edificio de
// otra organización simplemente no matchea nada (0 filas), no "abre" la
// otra organización. Verificado en la práctica, ver el reporte del paso.
export async function GET(request: Request) {
  const { organization } = await requireUser();

  const url = new URL(request.url);
  const rawParams = Object.fromEntries(url.searchParams.entries());
  const parsed = ticketInboxSearchParamsSchema.safeParse(
    normalizeSearchParams(rawParams),
  );
  // Mismo criterio que page.tsx: una URL de descarga armada a mano con un
  // valor inválido no tiene por qué romper la descarga -- cae a los
  // defaults del schema (que en la práctica, para exportación, ya no
  // importan: ver el comentario de getTicketsForExport sobre por qué
  // page/sort/dir no afectan el WHERE).
  const filters = parsed.success
    ? parsed.data
    : ticketInboxSearchParamsSchema.parse({});

  const inboxFilters = resolveTicketInboxFilters(
    filters,
    organization.timezone,
  );
  const rows = await getTicketsForExport(organization.id, inboxFilters);

  // Cero resultados: NO se rechaza ni se devuelve un error -- el archivo
  // sale igual, con SOLO el encabezado (ver el comentario de
  // buildTicketsExportCsv sobre por qué la forma `{fields, data}` de
  // Papa.unparse ya se banca esto sola). La UI (TicketFiltersBar) además
  // nunca muestra el botón cuando el filtro actual no matchea ningún
  // ticket -- mismo criterio que ya usan los chips de estado (paso 6.6) y
  // el resto de la bandeja: sin filas, la pantalla entera cae a un
  // EmptyState en vez de la tabla, y el botón vive al lado de la tabla.
  // Esta rama del Route Handler es la defensa de todos modos, por si se
  // pega la URL de exportación a mano después de que el filtro cambió.
  const csv = buildTicketsExportCsv(rows, organization.timezone);
  const dateSlug = formatDateSlug(new Date(), organization.timezone);

  return new NextResponse(new TextEncoder().encode(csv), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="reclamos-${dateSlug}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
