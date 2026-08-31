"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { lookupTicketStatusAction } from "../actions";
import {
  initialTicketStatusLookupState,
  ticketStatusLookupSchema,
  type TicketStatusLookupInput,
} from "../status-lookup-schema";
import { TicketStatusSummary } from "./ticket-status-summary";

// Vía b del paso 11.1 -- el vecino tipea su public_code a mano. Es la vía
// deliberadamente débil (código corto y enumerable, decidido así desde el
// paso 2.4b); el rate limit vive en la Server Action, no acá.
//
// Mismo patrón que LoginForm (auth/components/login-form.tsx): RHF valida
// del lado del cliente con el MISMO esquema Zod del servidor y recién
// entonces dispara la Server Action a mano, dentro de startTransition
// explícito (el dispatch de useActionState no se envuelve solo cuando se
// llama así, no por un <form action={fn}> nativo).
//
// `token` (el del edificio, de la URL de /r/[token]/estado) viaja en el
// mismo payload que el código -- va en defaultValues para que el esquema lo
// valide, sin input propio, igual que `next` en LoginForm. El servidor lo
// vuelve a resolver contra la base de todos modos.
export function TicketStatusLookupForm({ token }: { token: string }) {
  const [state, dispatch, isPending] = useActionState(
    lookupTicketStatusAction,
    initialTicketStatusLookupState,
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TicketStatusLookupInput>({
    resolver: zodResolver(ticketStatusLookupSchema),
    defaultValues: { token, publicCode: "" },
  });

  // Foco al código cuando el SERVIDOR devuelve un error (código no
  // encontrado, rate limit): RHF ya mueve el foco solo para los errores de
  // validación de cliente, pero no para estos. Mismo criterio que
  // LoginForm.
  const codeRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (state.status === "error") {
      codeRef.current?.focus();
    }
  }, [state]);

  const { ref: codeRegisterRef, ...codeRegister } = register("publicCode");

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="text-center">
        <h1 className="text-ink font-display text-xl font-semibold">
          Consultar un reclamo
        </h1>
        <p className="text-ink-muted text-sm">
          Escribí el código que te quedó al cargarlo (lo tenés en la pantalla de
          confirmación y en el mensaje de WhatsApp).
        </p>
      </div>

      <form
        noValidate
        onSubmit={handleSubmit((data) => startTransition(() => dispatch(data)))}
      >
        <FieldGroup>
          {state.status === "error" && (
            <Alert variant="destructive">
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          )}

          <Field data-invalid={!!errors.publicCode}>
            <FieldLabel htmlFor="publicCode">Código del reclamo</FieldLabel>
            <Input
              id="publicCode"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="TC-2026-0007"
              aria-invalid={!!errors.publicCode}
              {...codeRegister}
              ref={(el) => {
                codeRegisterRef(el);
                codeRef.current = el;
              }}
            />
            <FieldDescription>
              Con guiones, como aparece en tu confirmación.
            </FieldDescription>
            <FieldError errors={[errors.publicCode]} />
          </Field>

          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? "Buscando…" : "Ver estado"}
          </Button>
        </FieldGroup>
      </form>

      {state.status === "found" && (
        <div className="border-border bg-surface rounded-lg border p-4">
          <TicketStatusSummary ticket={state.ticket} />
        </div>
      )}

      <p className="text-center">
        <Link
          href={`/r/${token}`}
          className="text-ink-muted text-sm underline underline-offset-4"
        >
          Volver
        </Link>
      </p>
    </div>
  );
}
