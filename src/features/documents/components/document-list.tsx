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
  DOCUMENT_CATEGORY_LABEL,
  FILE_KIND_LABEL,
  formatFileSize,
  getFileKind,
  isDocumentCategory,
  type FileKind,
} from "../document-schema";
import type { DocumentListRow } from "../queries";
import { DocumentDownloadButton } from "./document-download-button";
import { DocumentVisibilityControl } from "./document-visibility-control";

const FILE_KIND_ICON: Record<FileKind, LucideIcon> = {
  pdf: FileText,
  word: FileText,
  excel: FileSpreadsheet,
  image: FileImage,
  other: FileIcon,
};

function categoryLabel(category: string): string {
  return isDocumentCategory(category)
    ? DOCUMENT_CATEGORY_LABEL[category]
    : category;
}

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

// Server Component -- las filas tienen dos controles de cliente chicos: el
// de visibilidad (paso 10.3, `<DocumentVisibilityControl>`) y el de
// descarga (paso 10.4, `<DocumentDownloadButton>`, que pide la URL firmada
// bajo demanda). Desktop: tabla. Mobile: tarjetas apiladas -- mismo
// criterio responsive que la bandeja de reclamos (una tabla de 7-8
// columnas no entra en un celular sin cortar contenido).
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
                  <span className="text-ink block truncate font-medium">
                    {row.title}
                  </span>
                  <span className="text-ink-muted block truncate text-xs">
                    {row.originalFilename}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {categoryLabel(row.category)}
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
                    categoryLabel={categoryLabel(row.category)}
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
                  <DocumentDownloadButton
                    documentId={row.id}
                    title={row.title}
                  />
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
                <p className="text-ink truncate text-sm font-medium">
                  {row.title}
                </p>
                <p className="text-ink-muted truncate text-xs">
                  {row.originalFilename}
                </p>
              </div>
              <DocumentDownloadButton documentId={row.id} title={row.title} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{categoryLabel(row.category)}</Badge>
              <DocumentVisibilityControl
                documentId={row.id}
                visibility={row.visibility}
                title={row.title}
                categoryLabel={categoryLabel(row.category)}
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
