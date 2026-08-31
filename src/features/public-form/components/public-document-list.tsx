import { FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { documentCategoryLabel } from "@/features/documents/document-schema";

import type { PublicBuildingDocument } from "../queries";
import { PublicDocumentDownloadButton } from "./public-document-download-button";

// Listado público de los documentos del edificio marcados como visibles
// para los vecinos (paso 11.3). Server Component puro -- la única parte
// interactiva es `PublicDocumentDownloadButton` (Client Component chico por
// fila, mismo criterio que el explorador del panel). El filtrado
// (`visibility = 'residents'`, edificio y organización correctos,
// `deleted_at IS NULL`) ya lo hizo la query (getPublicBuildingDocuments):
// acá no se vuelve a chequear nada, un documento privado nunca llega.
export function PublicDocumentList({
  token,
  documents,
}: {
  token: string;
  documents: PublicBuildingDocument[];
}) {
  if (documents.length === 0) {
    return (
      <div className="border-border text-ink-muted flex flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center text-sm">
        <FileText aria-hidden="true" className="size-6" />
        <p>
          Tu administración todavía no compartió documentos para este edificio.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {documents.map((doc) => (
        <li
          key={doc.id}
          className="border-border bg-surface flex items-center justify-between gap-3 rounded-lg border p-3"
        >
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-ink truncate text-sm font-medium">
              {doc.title}
            </span>
            <Badge variant="secondary" className="w-fit">
              {documentCategoryLabel(doc.category)}
            </Badge>
          </div>
          <PublicDocumentDownloadButton
            token={token}
            documentId={doc.id}
            title={doc.title}
          />
        </li>
      ))}
    </ul>
  );
}
