import { Building2 } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { RelativeDate } from "@/components/relative-date";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getActiveBuildings } from "@/features/buildings/queries";
import { getSelectedBuilding } from "@/features/buildings/selected-building";
import { DocumentUploadForm } from "@/features/documents/components/document-upload-form";
import {
  DOCUMENT_CATEGORY_LABEL,
  formatFileSize,
  isDocumentCategory,
} from "@/features/documents/document-schema";
import { getDocumentsForBuilding } from "@/features/documents/queries";
import { requireUser } from "@/lib/auth";

// Biblioteca de documentos (etapa 10). Paso 10.1: subida a Supabase Storage
// (bucket privado `building-documents`), organizada por edificio y
// categoría, con validación de tipo y tamaño en el servidor. El explorador
// completo (filtros, descarga con URLs firmadas, versiones) es 10.2+.
//
// Usa el MISMO selector de edificio del header que el resto del panel
// (CLAUDE.md > Selector de edificio activo), igual que Recordatorios: un
// documento siempre pertenece a UN edificio (documents.building_id NOT
// NULL), pero el listado puede mostrar los de todos a la vez, y el
// formulario pide el edificio con un <select> cuando la vista es "todos".
export default async function DocumentsPage() {
  const { organization } = await requireUser();

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
  const documents = await getDocumentsForBuilding(organization.id, buildingId);
  const showBuildingColumn = buildingId === null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Subir un documento</CardTitle>
          <CardDescription>
            {selectedBuilding
              ? `Se guarda en ${selectedBuilding.name}.`
              : "Elegí a qué edificio pertenece."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DocumentUploadForm
            buildingOptions={buildings}
            lockedBuildingId={buildingId}
          />
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-ink font-display text-lg font-semibold">
          Documentos cargados
        </h2>
        {documents.length === 0 ? (
          <p className="text-ink-muted text-sm">
            Todavía no hay documentos en este alcance. Subí el primero con el
            formulario.
          </p>
        ) : (
          <ul className="divide-border divide-y rounded-lg border">
            {documents.map((document) => (
              <li
                key={document.id}
                className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-ink truncate text-sm font-medium">
                    {document.title}
                  </p>
                  <p className="text-ink-muted truncate text-xs">
                    {document.originalFilename} ·{" "}
                    {formatFileSize(document.sizeBytes)}
                    {showBuildingColumn ? ` · ${document.buildingName}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="secondary">
                    {isDocumentCategory(document.category)
                      ? DOCUMENT_CATEGORY_LABEL[document.category]
                      : document.category}
                  </Badge>
                  <RelativeDate
                    date={document.createdAt}
                    timezone={organization.timezone}
                    className="text-ink-muted text-xs"
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
