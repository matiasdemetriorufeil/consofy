// Layout propio, separado del panel: sin nav, sin sidebar, sin nada del
// chrome del panel -- login es la puerta de entrada, no una pantalla más
// del panel. Centrado vertical y horizontal, con aire alrededor para que
// respire igual a 375px que en desktop.
export default function LoginLayout({ children }: LayoutProps<"/login">) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      {children}
    </main>
  );
}
