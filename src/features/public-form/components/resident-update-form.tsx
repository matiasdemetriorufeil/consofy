"use client";

import { useRouter } from "next/navigation";
import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

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
import { Textarea } from "@/components/ui/textarea";

import { addResidentUpdateAction } from "../actions";
import { compressImage } from "../compress-image";
import {
  initialResidentUpdateState,
  MAX_RESIDENT_UPDATE_TEXT,
} from "../resident-update-schema";
import {
  ACCEPTED_ATTACHMENT_MIME_TYPES,
  isAcceptedImageFile,
  MAX_TICKET_PHOTOS,
  validateAttachmentType,
} from "../ticket-schema";

const ACCEPT_ATTR = ACCEPTED_ATTACHMENT_MIME_TYPES.join(",");

// Formulario para que el vecino agregue información/fotos a un reclamo
// ABIERTO desde `/s/[token]` (paso 11.4). La page decide si renderizar esto
// (solo si el reclamo está en new/in_progress); si no, muestra un texto.
//
// Las imágenes se COMPRIMEN en el navegador (compressImage, reusada del
// 5.4 -- Canvas, solo cliente) antes de mandarlas a la Server Action en un
// FormData. La subida a Storage y el tope de 5 adjuntos los maneja la
// acción, del lado del servidor.
export function ResidentUpdateForm({
  token,
  remainingSlots,
}: {
  token: string;
  remainingSlots: number;
}) {
  const router = useRouter();
  const [state, dispatch, isPending] = useActionState(
    addResidentUpdateAction,
    initialResidentUpdateState,
  );
  const [clientError, setClientError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const photosFull = remainingSlots <= 0;

  // Al éxito: toast + limpiar el formulario + router.refresh() para que la
  // línea de tiempo y la galería de la page se re-consulten con lo nuevo.
  // useEffect (no ajuste durante render) porque router.refresh() es un
  // efecto, no un setState -- mismo criterio que LoginForm.
  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
      formRef.current?.reset();
      router.refresh();
    }
    // Solo depende de `state` (identidad nueva por cada dispatch); router y
    // toast son estables.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setClientError(null);

    const form = event.currentTarget;
    const text = (
      form.elements.namedItem("text") as HTMLTextAreaElement
    ).value.trim();
    const picked = Array.from(fileRef.current?.files ?? []);

    if (!text && picked.length === 0) {
      setClientError("Agregá un texto o al menos una foto.");
      return;
    }
    for (const file of picked) {
      const typeError = validateAttachmentType(file);
      if (typeError) {
        setClientError(typeError);
        return;
      }
    }

    const data = new FormData();
    data.set("token", token);
    if (text) {
      data.set("text", text);
    }

    setPreparing(true);
    try {
      for (const file of picked) {
        if (isAcceptedImageFile(file)) {
          const blob = await compressImage(file);
          data.append(
            "photo",
            new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, {
              type: "image/jpeg",
            }),
          );
        } else {
          data.append("photo", file); // PDF: tal cual, como en el 5.4
        }
      }
    } catch {
      setPreparing(false);
      setClientError(
        "No pudimos procesar alguna de las fotos. Probá con otra.",
      );
      return;
    }
    setPreparing(false);

    startTransition(() => dispatch(data));
  }

  const busy = isPending || preparing;

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate>
      <FieldGroup>
        <p className="text-ink text-sm font-medium">Agregar información</p>

        {state.status === "error" && (
          <Alert variant="destructive">
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}
        {clientError && (
          <Alert variant="destructive">
            <AlertDescription>{clientError}</AlertDescription>
          </Alert>
        )}

        <Field>
          <FieldLabel htmlFor="resident-update-text">
            Contanos algo más (opcional)
          </FieldLabel>
          <Textarea
            id="resident-update-text"
            name="text"
            rows={3}
            maxLength={MAX_RESIDENT_UPDATE_TEXT}
            disabled={busy}
            placeholder="Ej: el problema empeoró, ahora también gotea en el pasillo."
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="resident-update-photos">
            Fotos (opcional)
          </FieldLabel>
          <Input
            id="resident-update-photos"
            ref={fileRef}
            type="file"
            name="photos-picker"
            multiple
            accept={ACCEPT_ATTR}
            disabled={busy || photosFull}
          />
          <FieldDescription>
            {photosFull
              ? `Este reclamo ya tiene el máximo de ${MAX_TICKET_PHOTOS} fotos. Podés agregar información igual.`
              : `Podés agregar hasta ${remainingSlots} foto${remainingSlots === 1 ? "" : "s"} más (fotos o PDF, hasta 5 MB cada una).`}
          </FieldDescription>
          <FieldError errors={[]} />
        </Field>

        <Button type="submit" disabled={busy}>
          {busy ? "Enviando…" : "Enviar al administrador"}
        </Button>
      </FieldGroup>
    </form>
  );
}
