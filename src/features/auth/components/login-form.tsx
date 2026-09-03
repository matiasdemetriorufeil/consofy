"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { startTransition, useActionState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { loginAction } from "../actions";
import {
  initialLoginState,
  loginSchema,
  type LoginInput,
} from "../login-schema";

export function LoginForm({ next }: { next?: string }) {
  // useActionState, no useFormStatus: useFormStatus solo lee el estado de
  // un <form action={...}> nativo desde un componente HIJO de ese form. Acá
  // el submit lo maneja react-hook-form (handleSubmit hace la validación
  // client-side con el mismo esquema Zod del servidor, y recién si pasa
  // dispara la Server Action a mano) -- no hay un <form action={fn}>
  // nativo del que useFormStatus pueda leer nada. useActionState sí sirve
  // igual, llamado a mano: su isPending cubre el estado de carga del botón
  // sin depender de esa integración nativa.
  const [state, dispatch, isPending] = useActionState(
    loginAction,
    initialLoginState,
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  // Foco al fallar (punto 5): los errores de VALIDACIÓN de cliente (campo
  // vacío, email mal formado) ya mueven el foco solos -- react-hook-form
  // enfoca el primer campo inválido por default (shouldFocusError), no
  // hace falta nada de más para ese caso. El hueco real es el error del
  // SERVIDOR (credenciales incorrectas, rate limit, etc.): ahí no hay
  // ningún campo "inválido" para RHF, el foco se queda donde estaba (el
  // botón) si no se hace nada. Al email, no al Alert: así la persona puede
  // volver a escribir de una, sin un tab extra.
  const emailRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (state.error) {
      emailRef.current?.focus();
    }
  }, [state.error]);

  const { ref: emailRegisterRef, ...emailRegister } = register("email");

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-center text-xl">Consorfy</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          onSubmit={handleSubmit((data) =>
            // startTransition explícito: el dispatch de useActionState solo
            // se envuelve en una transición SOLO cuando Next la dispara por
            // el mecanismo nativo de <form action={fn}> -- llamado a mano
            // (como acá, desde handleSubmit de react-hook-form) no lo hace
            // solo. Sin esto, React tira un warning en consola y isPending
            // deja de ser confiable -- lo encontré así, con la consola real
            // del navegador, no leyendo la documentación.
            //
            // `next` viaja junto con email/password, no por su cuenta: es
            // más simple que coordinar dos fuentes de estado, y de todos
            // modos se vuelve a sanitizar en el servidor antes de usarse
            // (ver loginAction) -- acá no es más que un dato de más en el
            // mismo payload.
            startTransition(() => dispatch({ ...data, next })),
          )}
        >
          <FieldGroup>
            {state.error && (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}

            <Field data-invalid={!!errors.email}>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                aria-invalid={!!errors.email}
                {...emailRegister}
                ref={(el) => {
                  emailRegisterRef(el);
                  emailRef.current = el;
                }}
              />
              <FieldError errors={[errors.email]} />
            </Field>

            <Field data-invalid={!!errors.password}>
              <FieldLabel htmlFor="password">Contraseña</FieldLabel>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={!!errors.password}
                {...register("password")}
              />
              <FieldError errors={[errors.password]} />
            </Field>

            <Button type="submit" disabled={isPending} className="w-full">
              {isPending ? "Ingresando…" : "Ingresar"}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
