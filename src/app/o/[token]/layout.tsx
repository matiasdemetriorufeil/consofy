// Chrome puro, cero lógica -- mismo patrón exacto que
// src/app/r/[token]/layout.tsx y src/app/s/[token]/layout.tsx (ver el
// comentario largo del primero): la resolución del token vive en page.tsx,
// NO acá, porque un notFound() llamado desde un layout NO lo captura un
// not-found.tsx del MISMO segmento, solo uno del segmento padre. Con la
// lógica en page.tsx, src/app/o/[token]/not-found.tsx (mismo segmento)
// alcanza sin ese problema.
export default function OrganizationBuildingsLayout({
  children,
}: LayoutProps<"/o/[token]">) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      {children}
    </main>
  );
}
