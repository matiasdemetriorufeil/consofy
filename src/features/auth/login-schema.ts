import { z } from "zod";

// Compartido entre cliente (LoginForm, vía zodResolver) y servidor
// (loginAction) -- ver CLAUDE.md > Reglas de seguridad: toda entrada se
// valida con Zod en el servidor aunque ya se haya validado en el cliente.
// trim()+toLowerCase() acá (no solo al guardar) para que el email quede
// normalizado desde el primer momento en que existe como dato: el rate
// limit por email y la llamada a Supabase usan este mismo valor.
export const loginSchema = z.object({
  email: z.email({ message: "Ingresá un email válido." }).trim().toLowerCase(),
  password: z.string().min(1, { message: "Ingresá tu contraseña." }),
});

export type LoginInput = z.infer<typeof loginSchema>;

// Vive acá y no en actions.ts: un archivo "use server" solo puede exportar
// funciones async (todo lo demás lo rechaza el build) -- ni un type ni una
// const pueden vivir ahí, aunque estén directamente relacionados con la
// Server Action que sí vive en ese archivo.
export type LoginState = {
  error: string | null;
};

export const initialLoginState: LoginState = { error: null };
