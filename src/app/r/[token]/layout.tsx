// Chrome puro, cero lógica -- mismo espíritu que src/app/login/layout.tsx
// (superficie separada del panel, sin sidebar/header/selector), pero
// archivo propio, no compartido: login es una pantalla de administrador
// (aunque hoy se vea parecida), esta es la única puerta pública de la app
// (ver CLAUDE.md > Qué es este proyecto) -- que hoy compartan estilo no
// significa que tengan por qué evolucionar juntas.
//
// La resolución del token (válido / inexistente / inactivo / dado de
// baja) vive en page.tsx, no acá -- a propósito: un notFound() llamado
// desde un layout.tsx NO lo captura un not-found.tsx del MISMO segmento,
// solo uno del segmento PADRE (encontrado en la práctica en
// src/app/panel/buildings/not-found.tsx, con el comentario largo que
// explica por qué). Con la lógica en page.tsx en vez de acá,
// src/app/r/[token]/not-found.tsx (mismo segmento) alcanza sin ese
// problema -- verificado en el navegador, no asumido.
export default function PublicFormLayout({
  children,
}: LayoutProps<"/r/[token]">) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      {children}
    </main>
  );
}
