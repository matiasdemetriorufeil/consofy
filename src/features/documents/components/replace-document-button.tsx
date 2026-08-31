"use client";

import { Replace } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { replaceDocumentAction } from "../actions";
import {
  ALLOWED_DOCUMENT_EXTENSIONS,
  ALLOWED_DOCUMENT_TYPES_HELP,
  MAX_DOCUMENT_SIZE_BYTES,
  validateDocumentFilename,
  validateDocumentSize,
} from "../document-schema";

const ACCEPT_ATTR = ALLOWED_DOCUMENT_EXTENSIONS.join(",");

// Reemplazar un documento conservando el anterior como versión previa
// (paso 10.5). Ícono en la celda "Acciones", al lado de Descargar (10.4) --
// dos acciones inline, no un menú `⋮`: mismo criterio que
// `DocumentVisibilityControl`/`DocumentDownloadButton` (controles chicos
// por fila; `DocumentList` sigue siendo Server Component). Cuando aparezca
// una tercera acción de fila, ahí sí se justifica un menú.
//
// Reemplazar PIDE CONFIRMACIÓN -- mismo criterio que
// `MakeDocumentVisibleDialog` (10.3): tiene efecto real sobre lo que el
// administrador ve (la versión actual sale del listado), no debería pasar
// por un click accidental. El diálogo dice QUÉ documento se reemplaza y
// qué le pasa a la versión actual.
//
// El título arranca PRECARGADO con el título actual (a diferencia del alta
// del 10.1, que arranca vacío): en un reemplazo el documento ya tiene un
// título con sentido, y empezar en blanco invita a perderlo sin querer. Si
// el administrador lo borra, se aplica el mismo fallback del 10.1 (cae al
// nombre del archivo nuevo, lo resuelve la Server Action).
export function ReplaceDocumentButton({
  documentId,
  currentTitle,
  currentFilename,
}: {
  documentId: string;
  currentTitle: string;
  currentFilename: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setFileError(
      file
        ? (validateDocumentFilename(file.name) ??
            validateDocumentSize(file.size))
        : null,
    );
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setFileError("Elegí el archivo nuevo.");
      return;
    }
    const clientError =
      validateDocumentFilename(file.name) ?? validateDocumentSize(file.size);
    if (clientError) {
      setFileError(clientError);
      return;
    }

    const title = (
      form.elements.namedItem("title") as HTMLInputElement | null
    )?.value.trim();

    const formData = new FormData();
    formData.set("documentId", documentId);
    formData.set("file", file);
    if (title) {
      formData.set("title", title);
    }

    startTransition(async () => {
      const result = await replaceDocumentAction(formData);
      if (result.ok) {
        setOpen(false);
        toast.success(
          `"${currentTitle}" reemplazado. La versión anterior queda guardada.`,
        );
        // Reconcilia sin recargar la página entera: la fila vieja
        // (soft-borrada) desaparece y la nueva versión aparece arriba.
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setFileError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Reemplazar "${currentTitle}"`}
          title={`Reemplazar "${currentTitle}"`}
        >
          <Replace aria-hidden="true" />
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reemplazar &quot;{currentTitle}&quot;</DialogTitle>
          <DialogDescription>
            Vas a subir un archivo nuevo en lugar de{" "}
            <span className="font-medium">{currentFilename}</span>. La versión
            actual deja de aparecer en el listado a partir de ahora y queda
            guardada como versión anterior; la nueva hereda el edificio, la
            categoría y la visibilidad.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate>
          <FieldGroup>
            <Field data-invalid={!!fileError}>
              <FieldLabel htmlFor={`replace-file-${documentId}`}>
                Archivo nuevo
              </FieldLabel>
              <Input
                id={`replace-file-${documentId}`}
                ref={fileInputRef}
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

            <Field>
              <FieldLabel htmlFor={`replace-title-${documentId}`}>
                Título
              </FieldLabel>
              <Input
                id={`replace-title-${documentId}`}
                name="title"
                autoComplete="off"
                defaultValue={currentTitle}
                placeholder="Si lo dejás vacío usamos el nombre del archivo nuevo"
                disabled={isPending}
              />
            </Field>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => setOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending || !!fileError}>
                {isPending ? "Reemplazando…" : "Reemplazar documento"}
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
