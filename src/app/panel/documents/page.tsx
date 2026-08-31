import { Building2, FileText, SearchX } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { getActiveBuildings } from "@/features/buildings/queries";
import { getSelectedBuilding } from "@/features/buildings/selected-building";
import { DocumentFiltersBar } from "@/features/documents/components/document-filters-bar";
import { DocumentList } from "@/features/documents/components/document-list";
import { DocumentPagination } from "@/features/documents/components/document-pagination";
import { UploadDocumentButton } from "@/features/documents/components/upload-document-button";
import {
  buildDocumentListHref,
  DOCUMENT_LIST_PAGE_SIZE,
  documentListSearchParamsSchema,
  hasExplicitDocumentFilters,
  normalizeSearchParams,
} from "@/features/documents/document-list-schema";
import {
  getDocumentList,
  getDocumentListCount,
} from "@/features/documents/queries";
import { requireUser } from "@/lib/auth";

// Explorador de documentos (paso 10.2) -- la pantalla principal de la
// biblioteca. Reemplaza la lista mínima del paso 10.1; el alta pasa a un
// diálogo detrás del botón "Subir documento" (UploadDocumentButton), mismo
// patrón que /panel/announcements.
//
// Filtro de edificio: el selector del header (cookie, getSelectedBuilding),
// reusado tal cual como en Recordatorios/Comunicados -- ver CLAUDE.md >
// Selector de edificio activo. Filtros propios de esta pantalla (categoría,
// búsqueda, página): en la URL, mismo mecanismo que la bandeja de reclamos
// (ver document-list-schema.ts).
export default async function DocumentsPage({
  searchParams,
}: PageProps<"/panel/documents">) {
  const { organization } = await requireUser();
  const rawParams = await searchParams;
  const normalized = normalizeSearchParams(rawParams);
  const parsed = documentListSearchParamsSchema.safeParse(normalized);
  // Una URL escrita a mano con un valor inválido (`?category=banana`) no
  // rompe la pantalla -- cae a los defaults, mismo criterio que el resto
  // del panel.
  const filters = parsed.success
    ? parsed.data
    : documentListSearchParamsSchema.parse({});

  const [buildings, selectedBuilding] = await Promise.all([
    getActiveBuildings(organization.id),
    getSelectedBuilding(organization.id),
  ]);

  if (buildings.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="Todavía no tenés ningún edificio cargado"
        description="Los documentos se organizan por edificio -- creá el primero para empezar a subir actas, reglamentos y balances."
        action={{
          label: "Cargar mi primer edificio",
          href: "/panel/buildings",
        }}
      />
    );
  }

  const buildingId = selectedBuilding?.id ?? null;
  const listFilters = {
    buildingId,
    category: filters.category ?? null,
    q: filters.q || null,
  };

  let { rows, totalCount } = await getDocumentList(
    organization.id,
    listFilters,
    filters.page,
  );
  let totalPages = Math.max(1, Math.ceil(totalCount / DOCUMENT_LIST_PAGE_SIZE));
  let effectivePage = filters.page;

  // Cero filas Y una página > 1: bookmark viejo, o un filtro que redujo el
  // resultado mientras el admin estaba en una página alta. `count(*)
  // over()` no viaja en ninguna fila cuando el OFFSET salta más allá del
  // total, así que se pregunta el total real aparte -- SOLO en esta rama,
  // nunca en el camino normal. Mismo patrón que la bandeja de reclamos
  // (paso 6.2).
  if (rows.length === 0 && filters.page > 1) {
    const realTotal = await getDocumentListCount(organization.id, listFilters);
    totalPages = Math.max(1, Math.ceil(realTotal / DOCUMENT_LIST_PAGE_SIZE));
    if (realTotal > 0) {
      effectivePage = totalPages;
      ({ rows, totalCount } = await getDocumentList(
        organization.id,
        listFilters,
        effectivePage,
      ));
    } else {
      totalCount = 0;
    }
  }

  const explicitFilters = hasExplicitDocumentFilters(filters);
  const showBuildingColumn = buildingId === null;

  function buildPageHref(page: number): string {
    return buildDocumentListHref("/panel/documents", normalized, {
      page: page === 1 ? null : String(page),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-ink font-display text-xl font-semibold">
          Documentos
        </h1>
        <UploadDocumentButton
          buildingOptions={buildings}
          lockedBuildingId={buildingId}
        />
      </div>

      <DocumentFiltersBar
        current={{ category: filters.category ?? null, q: filters.q || null }}
      />

      {rows.length === 0 ? (
        explicitFilters ? (
          <EmptyState
            icon={SearchX}
            title="No encontramos documentos con esos filtros"
            description="Probá con otra categoría o cambiá el término de búsqueda."
            action={{ label: "Limpiar filtros", href: "/panel/documents" }}
          />
        ) : (
          <EmptyState
            icon={FileText}
            title={
              selectedBuilding
                ? `Todavía no hay documentos en ${selectedBuilding.name}`
                : "Todavía no hay documentos"
            }
            description="Subí actas, reglamentos, balances y otros archivos con el botón de arriba."
          />
        )
      ) : (
        <>
          <p className="text-ink-muted text-sm">
            {totalCount === 1 ? "1 documento" : `${totalCount} documentos`}
            {totalPages > 1 && ` · página ${effectivePage} de ${totalPages}`}
          </p>

          <DocumentList
            rows={rows}
            showBuildingColumn={showBuildingColumn}
            organizationTimezone={organization.timezone}
          />

          <DocumentPagination
            currentPage={effectivePage}
            totalPages={totalPages}
            buildHref={buildPageHref}
          />
        </>
      )}
    </div>
  );
}
