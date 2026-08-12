import { redirect } from "next/navigation";

import { LoginForm } from "@/features/auth/components/login-form";
import { getAuthorizedUser } from "@/lib/auth";

export default async function LoginPage() {
  // getAuthorizedUser(), no requireUser(): acá el caso "hay sesión de
  // Supabase pero no autorización completa" tiene que dejar VER el
  // formulario de login, no redirigir -- ver el comentario largo en
  // src/lib/auth.ts sobre por qué requireUser() causaría un loop acá.
  const authorized = await getAuthorizedUser();
  if (authorized) {
    redirect("/panel");
  }

  return <LoginForm />;
}
