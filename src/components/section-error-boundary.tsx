"use client";

import { useRouter } from "next/navigation";
import { Component, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

// Error boundary local para envolver UNA sección de una pantalla (ej. un
// widget del dashboard) -- si esa sección falla, el resto de la pantalla
// sigue en pie, a diferencia de un `error.tsx` de ruta, que reemplaza la
// pantalla entera.
//
// Componente de clase escrito a mano (no `react-error-boundary`): React 19
// todavía no tiene un `<ErrorBoundary>` de función, y sumar una dependencia
// para esto no se justifica (ver CLAUDE.md > Qué NO hacer). El patrón de
// clase con `getDerivedStateFromError` + `componentDidCatch` es el oficial
// de React.
//
// NO expone el mensaje de la excepción ni el stack al usuario -- solo un
// texto genérico y un botón para reintentar. El detalle real va a
// `console.error`, igual que en los `error.tsx` de ruta.
//
// "Reintentar" hace `router.refresh()` ADEMÁS de limpiar el estado de
// error: los hijos suelen ser Server Components ya renderizados (el
// dashboard los transmite dentro de un <Suspense>), así que volver a
// montarlos sin re-pedir el RSC mostraría el mismo error. `router.refresh()`
// es lo que fuerza a Next a volver a ejecutar esa parte del árbol en el
// servidor.

type BoundaryProps = {
  children: ReactNode;
  title: string;
  onRetry: () => void;
};

type BoundaryState = { hasError: boolean };

class Boundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { hasError: false };

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown) {
    console.error("[SectionErrorBoundary]", error);
  }

  private reset = () => {
    this.setState({ hasError: false });
    this.props.onRetry();
  };

  override render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <section className="border-border flex flex-col items-start gap-2 rounded-lg border border-dashed px-4 py-6">
        <p className="text-ink text-sm font-medium">
          No pudimos cargar {this.props.title}.
        </p>
        <p className="text-ink-muted text-sm">
          El resto de la pantalla sigue funcionando. Probá de nuevo en un
          momento.
        </p>
        <Button variant="outline" size="sm" onClick={this.reset}>
          Reintentar
        </Button>
      </section>
    );
  }
}

export function SectionErrorBoundary({
  children,
  title,
}: {
  children: ReactNode;
  // Nombre corto de la sección, para el texto ("No pudimos cargar {title}").
  title: string;
}) {
  const router = useRouter();
  return (
    <Boundary title={title} onRetry={() => router.refresh()}>
      {children}
    </Boundary>
  );
}
