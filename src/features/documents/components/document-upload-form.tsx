"use client";

import { useActionState, useEffect, useRef, useState } from "react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ActiveBuildingOption } from "@/features/buildings/queries";

import { uploadDocumentAction } from "../actions";
import {
  ALLOWED_DOCUMENT_EXTENSIONS,
  ALLOWED_DOCUMENT_TYPES_HELP,
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_LABEL,
  initialDocumentUploadState,
  MAX_DOCUMENT_SIZE_BYTES,
  validateDocumentFilename,
  validateDocumentSize,
  type DocumentCategory,
} from "../document-schema";

const ACCEPT_ATTR = ALLOWED_DOCUMENT_EXTENSIONS.join(",");

// `buildingId` y `category` viven en estado propio + inputs ocultos (no en
// react-hook-form) -- mismo criterio que ReminderForm: el <Select> de Radix
// no envía un valor nativo al <form>, así que se sincroniza a mano con un
// <input type="hidden">, que es lo que el FormData de la Server Action
// termina leyendo.
//
// `lockedBuildingId`: el edificio elegido en el header. Cuando está, el
// formulario no muestra el selector de edificio (el contexto ya lo fija);
// cuando es `null` (vista "todos los edificios"), lo pide con un <Select>.
//
// `onSuccess`: lo llama el caller (UploadDocumentButton) al recibir
// `state.ok` -- cierra el diálogo y muestra el toast. El formulario no
// toastea por su cuenta para no duplicarlo. Mismo criterio que
// ReminderForm/ReminderFormDialog (paso 9.1).
export function DocumentUploadForm({
  buildingOptions,
  lockedBuildingId,
  onSuccess,
}: {
  buildingOptions: ActiveBuildingOption[];
  lockedBuildingId: string | null;
  onSuccess?: () => void;
}) {
  const [state, formAction, isPending] = useActionState(
    uploadDocumentAction,
    initialDocumentUploadState,
  );

  const formRef = useRef<HTMLFormElement>(null);
  const [buildingId, setBuildingId] = useState(lockedBuildingId ?? "");
  const [category, setCategory] = useState<DocumentCategory | "">("");
  // Validación inmediata del archivo elegido, del lado del cliente -- la
  // validación REAL vuelve a correr en el servidor (ver actions.ts).
  const [clientFileError, setClientFileError] = useState<string | null>(null);

  // Tras una subida exitosa: se limpian los campos NATIVOS (archivo,
  // título, descripción) con `form.reset()` y se avisa al caller
  // (`onSuccess` -- cierra el diálogo y toastea). Sin `setState` acá (regla
  // `react-hooks/set-state-in-effect`, ver CLAUDE.md > paso 8.2):
  // `form.reset()` no es estado de React, y `clientFileError` ya es `null`
  // cuando se llega a enviar (el botón está deshabilitado si no).
  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      onSuccess?.();
    }
    // Solo `state` en las deps -- `onSuccess` suele ser una arrow inline
    // (identidad nueva por render), incluirla re-dispararía el efecto en
    // cada render y volvería a llamar onSuccess()/toast. Mismo criterio
    // (y misma excepción de lint) que el efecto de ReminderForm.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setClientFileError(null);
      return;
    }
    setClientFileError(
      validateDocumentFilename(file.name) ?? validateDocumentSize(file.size),
    );
  }

  const fileError = clientFileError ?? state.fieldErrors.file;

  return (
    <form ref={formRef} action={formAction} noValidate>
      <FieldGroup>
        {state.formError && (
          <Alert variant="destructive">
            <AlertDescription>{state.formError}</AlertDescription>
          </Alert>
        )}

        {lockedBuildingId ? (
          <input type="hidden" name="buildingId" value={lockedBuildingId} />
        ) : (
          <Field data-invalid={!!state.fieldErrors.buildingId}>
            <FieldLabel htmlFor="document-building">Edificio</FieldLabel>
            <input type="hidden" name="buildingId" value={buildingId} />
            <Select
              value={buildingId}
              onValueChange={setBuildingId}
              disabled={isPending}
            >
              <SelectTrigger
                id="document-building"
                aria-invalid={!!state.fieldErrors.buildingId}
                className="w-full"
              >
                <SelectValue placeholder="Elegí un edificio" />
              </SelectTrigger>
              <SelectContent>
                {buildingOptions.map((building) => (
                  <SelectItem key={building.id} value={building.id}>
                    {building.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError
              errors={[
                state.fieldErrors.buildingId
                  ? { message: state.fieldErrors.buildingId }
                  : undefined,
              ]}
            />
          </Field>
        )}

        <Field data-invalid={!!state.fieldErrors.category}>
          <FieldLabel htmlFor="document-category">Categoría</FieldLabel>
          <input type="hidden" name="category" value={category} />
          <Select
            value={category}
            onValueChange={(value) => setCategory(value as DocumentCategory)}
            disabled={isPending}
          >
            <SelectTrigger
              id="document-category"
              aria-invalid={!!state.fieldErrors.category}
              className="w-full"
            >
              <SelectValue placeholder="Elegí una categoría" />
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_CATEGORIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {DOCUMENT_CATEGORY_LABEL[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError
            errors={[
              state.fieldErrors.category
                ? { message: state.fieldErrors.category }
                : undefined,
            ]}
          />
        </Field>

        <Field data-invalid={!!fileError}>
          <FieldLabel htmlFor="document-file">Archivo</FieldLabel>
          <Input
            id="document-file"
            type="file"
            name="file"
            accept={ACCEPT_ATTR}
            aria-invalid={!!fileError}
            disabled={isPending}
            onChange={handleFileChange}
          />
          <FieldDescription>
            {ALLOWED_DOCUMENT_TYPES_HELP}. Hasta{" "}
            {Math.round(MAX_DOCUMENT_SIZE_BYTES / (1024 * 1024))} MB.
          </FieldDescription>
          <FieldError
            errors={[fileError ? { message: fileError } : undefined]}
          />
        </Field>

        <Field data-invalid={!!state.fieldErrors.title}>
          <FieldLabel htmlFor="document-title">Título</FieldLabel>
          <Input
            id="document-title"
            name="title"
            autoComplete="off"
            placeholder="Opcional -- si lo dejás vacío usamos el nombre del archivo"
            aria-invalid={!!state.fieldErrors.title}
            disabled={isPending}
          />
          <FieldError
            errors={[
              state.fieldErrors.title
                ? { message: state.fieldErrors.title }
                : undefined,
            ]}
          />
        </Field>

        <Field data-invalid={!!state.fieldErrors.description}>
          <FieldLabel htmlFor="document-description">Descripción</FieldLabel>
          <Textarea
            id="document-description"
            name="description"
            placeholder="Opcional"
            aria-invalid={!!state.fieldErrors.description}
            disabled={isPending}
          />
          <FieldError
            errors={[
              state.fieldErrors.description
                ? { message: state.fieldErrors.description }
                : undefined,
            ]}
          />
        </Field>

        <Button
          type="submit"
          disabled={isPending || !!clientFileError}
          className="w-full"
        >
          {isPending ? "Subiendo…" : "Subir documento"}
        </Button>
      </FieldGroup>
    </form>
  );
}
