// Chrome puro, cero lógica -- mismo patrón que src/app/r/[token]/layout.tsx
// (ver el comentario largo de ese archivo): la resolución del token vive en
// page.tsx, no acá, porque un notFound() llamado desde un layout NO lo
// captura un not-found.tsx del MISMO segmento, solo uno del segmento
// padre -- con la lógica en page.tsx, src/app/s/[token]/not-found.tsx
// (mismo segmento) alcanza sin ese problema.
export default function TicketAttachmentsGalleryLayout({
  children,
}: LayoutProps<"/s/[token]">) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      {children}
    </main>
  );
}
