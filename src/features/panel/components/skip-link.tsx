// Primer elemento enfocable del layout del panel (punto 6 del paso 3.4):
// invisible hasta que se recibe foco por teclado, así no ocupa lugar para
// quien usa mouse/touch pero le ahorra a quien usa teclado tener que pasar
// por el sidebar entero en cada página para llegar al contenido.
export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="bg-primary text-primary-foreground focus-visible:ring-ring sr-only rounded-md px-3 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus-visible:ring-3 focus-visible:outline-none"
    >
      Saltar al contenido
    </a>
  );
}
