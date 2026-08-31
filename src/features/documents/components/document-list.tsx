import {
  Download,
  File as FileIcon,
  FileImage,
  FileSpreadsheet,
  FileText,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  DOCUMENT_VISIBILITY_LABEL,
  FILE_KIND_LABEL,
  formatFileSize,
  getFileKind,
  isDocumentCategory,
  type FileKind,
} from "../document-schema";
import type { DocumentListRow } from "../queries";

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

// Descargar/ver es el paso 10.4 (URLs firmadas) -- acá solo la afordancia,
// deshabilitada. El `<span title>` que la envuelve es lo que hace que el
// tooltip aparezca al pasar el mouse aunque el botón esté disabled (varios
// navegadores no disparan hover sobre un control deshabilitado).
function DownloadAffordance() {
  return (
    <span title="Disponible en el próximo paso (descarga con enlace seguro)">
      <Button
        variant="ghost"
        size="icon-sm"
        disabled
        aria-label="Descargar (disponible próximamente)"
      >
        <Download aria-hidden="true" />
      </Button>
    </span>
  );
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

function VisibilityBadge({
  visibility,
}: {
  visibility: DocumentListRow["visibility"];
}) {
  return (
    <Badge variant={visibility === "residents" ? "outline" : "secondary"}>
      {DOCUMENT_VISIBILITY_LABEL[visibility]}
    </Badge>
  );
}

// Server Component puro -- una fila de documento no tiene ninguna
// interacción de cliente en este paso (la descarga es 10.4, la edición de
// visibilidad es 10.3). Desktop: tabla. Mobile: tarjetas apiladas -- mismo
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
                  <VisibilityBadge visibility={row.visibility} />
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
                  <DownloadAffordance />
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
              <DownloadAffordance />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{categoryLabel(row.category)}</Badge>
              <VisibilityBadge visibility={row.visibility} />
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
