import {
  File as FileIcon,
  FileImage,
  FileSpreadsheet,
  FileText,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatExactDate } from "@/lib/format-date";

import {
  documentCategoryLabel,
  FILE_KIND_LABEL,
  formatFileSize,
  getFileKind,
  type FileKind,
} from "../document-schema";
import type { DocumentListRow } from "../queries";
import { DocumentDownloadButton } from "./document-download-button";
import { DocumentVisibilityControl } from "./document-visibility-control";
import { ReplaceDocumentButton } from "./replace-document-button";

const FILE_KIND_ICON: Record<FileKind, LucideIcon> = {
  pdf: FileText,
  word: FileText,
  excel: FileSpreadsheet,
  image: FileImage,
  other: FileIcon,
};

function FileTypeCell({ mimeType }: { mimeType: string }) {
  const kind = getFileKind(mimeType);
  const Icon = FILE_KIND_ICON[kind];
  return (
    <span className="text-ink-muted inline-flex items-center gap-1.5">
      <Icon aria-hidden="true" className="size-4" />
      {FILE_KIND_LABEL[kind]}
    </span>
  );
}

// Indicador simple de que el documento tiene historial (paso 10.5) -- se
// muestra cuando `version > 1`. No hay pantalla de historial de versiones
// (ver el reporte del paso): la versión anterior se conserva en la base
// (fila soft-borrada, cadena `supersedes_id`) y en Storage, lista para un
// paso futuro, pero no se expone en el panel todavía.
function VersionBadge({ version }: { version: number }) {
  if (version <= 1) {
    return null;
  }
  return (
    <Badge
      variant="outline"
      className="shrink-0"
      title={`Versión ${version} -- reemplazado ${version - 1} ${
        version - 1 === 1 ? "vez" : "veces"
      }`}
    >
      v{version}
    </Badge>
  );
}

// Server Component -- las filas tienen controles de cliente chicos y
// autocontenidos: visibilidad (paso 10.3, `<DocumentVisibilityControl>`),
// descarga (paso 10.4, `<DocumentDownloadButton>`, URL firmada bajo
// demanda) y reemplazo (paso 10.5, `<ReplaceDocumentButton>`). Desktop:
// tabla. Mobile: tarjetas apiladas -- mismo criterio responsive que la
// bandeja de reclamos (una tabla de 7-8 columnas no entra en un celular
// sin cortar contenido).
export function DocumentList({
  rows,
  showBuildingColumn,
  organizationTimezone,
}: {
  rows: DocumentListRow[];
  showBuildingColumn: boolean;
  organizationTimezone: string;
}) {
  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Categoría</TableHead>
              {showBuildingColumn && <TableHead>Edificio</TableHead>}
              <TableHead>Tipo</TableHead>
              <TableHead>Tamaño</TableHead>
              <TableHead>Visibilidad</TableHead>
              <TableHead>Subido por</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="max-w-64">
                  <span className="flex items-center gap-1.5">
                    <span className="text-ink truncate font-medium">
                      {row.title}
                    </span>
                    <VersionBadge version={row.version} />
                  </span>
                  <span className="text-ink-muted block truncate text-xs">
                    {row.originalFilename}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {documentCategoryLabel(row.category)}
                  </Badge>
                </TableCell>
                {showBuildingColumn && (
                  <TableCell className="max-w-40 truncate">
                    {row.buildingName}
                  </TableCell>
                )}
                <TableCell>
                  <FileTypeCell mimeType={row.mimeType} />
                </TableCell>
                <TableCell className="text-ink-muted whitespace-nowrap">
                  {formatFileSize(row.sizeBytes)}
                </TableCell>
                <TableCell>
                  <DocumentVisibilityControl
                    documentId={row.id}
                    visibility={row.visibility}
                    title={row.title}
                    categoryLabel={documentCategoryLabel(row.category)}
                    buildingName={row.buildingName}
                  />
                </TableCell>
                <TableCell className="text-ink-muted max-w-32 truncate">
                  {row.uploadedBy ?? "—"}
                </TableCell>
                <TableCell className="text-ink-muted whitespace-nowrap">
                  <time dateTime={row.createdAt.toISOString()}>
                    {formatExactDate(row.createdAt, organizationTimezone)}
                  </time>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end">
                    <DocumentDownloadButton
                      documentId={row.id}
                      title={row.title}
                    />
                    <ReplaceDocumentButton
                      documentId={row.id}
                      currentTitle={row.title}
                      currentFilename={row.originalFilename}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((row) => (
          <li
            key={row.id}
            className="border-border bg-surface flex flex-col gap-2 rounded-lg border p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5">
                  <span className="text-ink truncate text-sm font-medium">
                    {row.title}
                  </span>
                  <VersionBadge version={row.version} />
                </p>
                <p className="text-ink-muted truncate text-xs">
                  {row.originalFilename}
                </p>
              </div>
              <div className="flex shrink-0 items-center">
                <DocumentDownloadButton documentId={row.id} title={row.title} />
                <ReplaceDocumentButton
                  documentId={row.id}
                  currentTitle={row.title}
                  currentFilename={row.originalFilename}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {documentCategoryLabel(row.category)}
              </Badge>
              <DocumentVisibilityControl
                documentId={row.id}
                visibility={row.visibility}
                title={row.title}
                categoryLabel={documentCategoryLabel(row.category)}
                buildingName={row.buildingName}
              />
            </div>

            <p className="text-ink-muted flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <FileTypeCell mimeType={row.mimeType} />
              <span aria-hidden="true">·</span>
              <span>{formatFileSize(row.sizeBytes)}</span>
              {showBuildingColumn && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{row.buildingName}</span>
                </>
              )}
            </p>

            <p className="text-ink-muted text-xs">
              {row.uploadedBy ? `${row.uploadedBy} · ` : ""}
              <time dateTime={row.createdAt.toISOString()}>
                {formatExactDate(row.createdAt, organizationTimezone)}
              </time>
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
