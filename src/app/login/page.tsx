import { redirect } from "next/navigation";

import { LoginForm } from "@/features/auth/components/login-form";
import { getAuthorizedUser } from "@/lib/auth";
import { sanitizeNextPath } from "@/lib/safe-redirect";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  // getAuthorizedUser(), no requireUser(): acá el caso "hay sesión de
  // Supabase pero no autorización completa" tiene que dejar VER el
  // formulario de login, no redirigir -- ver el comentario largo en
  // src/lib/auth.ts sobre por qué requireUser() causaría un loop acá.
  const authorized = await getAuthorizedUser();
  const { next } = await searchParams;
  const nextParam = Array.isArray(next) ? next[0] : next;

  if (authorized) {
    // sanitizeNextPath() acá también: mismo query param manipulable a
    // mano, mismo chequeo que en loginAction (src/features/auth/actions.ts)
    // -- ver src/lib/safe-redirect.ts.
    redirect(sanitizeNextPath(nextParam));
  }

  return <LoginForm next={nextParam} />;
}
