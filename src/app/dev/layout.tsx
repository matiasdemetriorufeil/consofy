import { notFound } from "next/navigation";

// Todo lo que cuelga de /dev/* es de uso interno (ej: /dev/styleguide) y no
// debe existir en producción. VERCEL_ENV distingue production de preview,
// a diferencia de NODE_ENV: en local y en preview sigue accesible.
//
// force-dynamic es necesario: sin datos dinámicos, Next prerenderiza estas
// rutas en build time y hornea el VERCEL_ENV de ese momento en el HTML. Con
// esto, el chequeo se evalúa en cada request.
export const dynamic = "force-dynamic";

export default function DevLayout({ children }: LayoutProps<"/dev">) {
  if (process.env.VERCEL_ENV === "production") {
    notFound();
  }

  return children;
}
