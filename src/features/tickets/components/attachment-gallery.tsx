import { File as FileIcon } from "lucide-react";

// Extraído de /s/[token]/page.tsx en el paso 6.3, cuando la vista de
// detalle del panel se volvió su segundo consumidor real -- mismo grid de
// miniaturas, mismo criterio de "ampliar sin lightbox propio" (ver
// CLAUDE.md > Galería pública de adjuntos): cada miniatura es un
// `<a target="_blank">` a la URL firmada, que abre la imagen a resolución
// completa en el visor NATIVO del navegador (con pinch-zoom real en
// celular), en vez de construir una galería/lightbox en JS.
export type AttachmentGalleryItem = {
  id: string;
  storagePath: string;
  mimeType: string;
  originalFilename: string;
};

export function AttachmentGallery({
  attachments,
  signedUrls,
  emptyMessage,
}: {
  attachments: AttachmentGalleryItem[];
  signedUrls: Map<string, string>;
  emptyMessage: string;
}) {
  if (attachments.length === 0) {
    return (
      <p className="text-ink-muted rounded-lg border border-dashed p-4 text-center text-sm">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3 sm:grid sm:grid-cols-2">
      {attachments.map((attachment) => {
        const url = signedUrls.get(attachment.storagePath);
        if (!url) {
          return null;
        }
        const isImage = attachment.mimeType.startsWith("image/");
        return (
          <li key={attachment.id}>
            {/* target="_blank" a un archivo YA cargado (no un <Image> de
                Next): la URL es firmada y de corta duración, cambia en
                cada carga de esta página -- el optimizador de imágenes de
                Next intentaría cachear/proxear una URL pensada para
                vencer, así que una imagen simple es lo correcto acá, no
                un atajo. */}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              {isImage ? (
                // eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal, no un asset de Next
                <img
                  src={url}
                  alt={attachment.originalFilename}
                  loading="lazy"
                  className="border-border h-64 w-full rounded-lg border object-cover"
                />
              ) : (
                <div className="border-border bg-muted/40 flex h-64 w-full flex-col items-center justify-center gap-2 rounded-lg border">
                  <FileIcon className="text-muted-foreground size-8" />
                  <span className="text-ink-muted px-4 text-center text-sm">
                    {attachment.originalFilename}
                  </span>
                </div>
              )}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
