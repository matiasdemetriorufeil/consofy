"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { File as FileIcon, RotateCw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { AR_WHATSAPP_HELP } from "@/lib/phone";
import { cn } from "@/lib/utils";

import type { PublicFormCategory } from "../queries";
import {
  IDENTIFICATION_STEP_FIELDS,
  MAX_TICKET_PHOTOS,
  PROBLEM_STEP_FIELDS,
  PUBLIC_TICKET_STEPS,
  TOTAL_STEPS,
  publicTicketFormSchema,
  validateAttachmentType,
  type PublicTicketFormInput,
} from "../ticket-schema";
import {
  AttachmentUploadError,
  formatBytes,
  uploadFormAttachment,
  deleteFormAttachment,
} from "../upload-attachment";
import {
  formatUnitLabel,
  UnitCombobox,
  type PublicFormUnit,
} from "./unit-combobox";

const DEFAULT_VALUES: PublicTicketFormInput = {
  firstName: "",
  lastName: "",
  phoneE164: "",
  unitNotListed: false,
  unitId: null,
  unitLabelRaw: "",
  categoryId: "",
  description: "",
};

// Namespace por token, no global -- dos edificios distintos (dos pestañas,
// o el mismo celular usado para cargar un reclamo en cada uno) no se pisan
// el borrador. Ver el comentario largo más abajo sobre qué se guarda y qué
// no.
function draftKey(token: string): string {
  return `consofy:reclamo-borrador:${token}`;
}

// Estado de cada adjunto (paso 5.4): "queued" -> "processing" (comprimiendo
// o subiendo) -> "uploaded" | "error". `file` SOLO existe mientras dura
// esta misma sesión de pestaña -- no se persiste (ver el borrador más
// abajo), así que un item restaurado después de recargar la página nunca
// puede volver a "processing": si no llegó a "uploaded" antes de cerrar el
// navegador, se pierde -- mismo trade-off que el paso 5.2 ya documentó para
// fotos, ahora acotado solo al tiempo real de subida (segundos), no a todo
// el formulario.
type AttachmentStatus = "queued" | "processing" | "uploaded" | "error";

type AttachmentItem = {
  id: string;
  file: File | null;
  status: AttachmentStatus;
  path: string | null;
  originalFilename: string;
  sizeBytes: number;
  mimeType: string;
  errorMessage: string | null;
};

type PersistedAttachment = Omit<AttachmentItem, "file">;

function stripFile(item: AttachmentItem): PersistedAttachment {
  const {
    id,
    status,
    path,
    originalFilename,
    sizeBytes,
    mimeType,
    errorMessage,
  } = item;
  return {
    id,
    status,
    path,
    originalFilename,
    sizeBytes,
    mimeType,
    errorMessage,
  };
}

type Draft = {
  step: number;
  values: PublicTicketFormInput;
  formSessionId: string;
  attachments: PersistedAttachment[];
};

// Barra de progreso mínima (sin depender de un componente ui/progress
// nuevo): dos divs, ancho por porcentaje. Accesible con role="progressbar"
// -- no hace falta más para lo que pide el paso 5.2 ("el vecino tiene que
// saber cuánto le falta").
function StepProgress({ step }: { step: number }) {
  const percent = Math.round((step / TOTAL_STEPS) * 100);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-ink-muted text-xs">
        Paso {step} de {TOTAL_STEPS}
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={TOTAL_STEPS}
        aria-valuenow={step}
        aria-label="Progreso del formulario"
        className="bg-muted h-1.5 w-full overflow-hidden rounded-full"
      >
        <div
          className="bg-primary h-full rounded-full transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

// Formulario público de reclamos, en 4 pasos DENTRO de una sola instancia
// de react-hook-form (paso 5.2) -- no 4 rutas ni 4 componentes remontados.
// Decisión justificada en el reporte de este paso: para el criterio de los
// 90 segundos, cuatro navegaciones de página (con su propio round-trip e
// re-render completo) suman fricción real que cuatro secciones de UN
// formulario no tienen -- volver de un paso al anterior es instantáneo y
// no pierde nada, porque nunca se desmonta el estado.
export function TicketForm({
  token,
  categories,
  units,
}: {
  token: string;
  categories: PublicFormCategory[];
  units: PublicFormUnit[];
}) {
  const [step, setStep] = useState(1);
  const [hydrated, setHydrated] = useState(false);
  // Un id por CARGA del formulario, no por reclamo -- ver
  // upload-attachment.ts para el porqué completo. Se genera acá mismo
  // (lazy initializer de useState, corre una sola vez) y el efecto de
  // hidratación de abajo lo pisa si había uno guardado en el borrador.
  const [formSessionId] = useState(() => crypto.randomUUID());
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [attachmentsBusy, setAttachmentsBusy] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    control,
    trigger,
    watch,
    reset,
    setValue,
    formState: { errors },
  } = useForm<PublicTicketFormInput>({
    resolver: zodResolver(publicTicketFormSchema),
    defaultValues: DEFAULT_VALUES,
  });

  // Si el edificio no tiene unidades cargadas todavía, no tiene sentido
  // mostrar un selector vacío sin salida -- arranca directo en modo "no
  // encuentro mi unidad". Va ANTES del efecto que restaura el borrador
  // (declarado justo debajo) para que un valor guardado de verdad lo pise:
  // React corre los efectos en el orden en que se declaran.
  useEffect(() => {
    if (units.length === 0) {
      setValue("unitNotListed", true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recupera un borrador de este mismo dispositivo (paso 5.2, "¿qué pasa si
  // cierra el navegador a mitad de camino?"): alguien parado en un pasillo
  // con mala señal puede perder la pestaña sin querer. Se guarda por token
  // (ver draftKey), en localStorage (no sessionStorage: tiene que sobrevivir
  // a cerrar y reabrir el navegador, no solo a recargar la pestaña).
  //
  // Los ADJUNTOS sí se recuperan ahora (revisión del paso 5.4 sobre la
  // decisión del 5.2): un `File` no sobrevive JSON.stringify, pero desde
  // que las fotos se suben EN EL MOMENTO (ver más abajo), lo que hay que
  // recordar no es el archivo sino su `storage_path` -- un string, que sí
  // sobrevive. Solo se restauran los que llegaron a "uploaded": uno que
  // estaba a mitad de subir cuando se cerró el navegador no tiene forma de
  // reanudarse (el File en sí sí se pierde), así que se descarta sin más.
  useEffect(() => {
    const raw = window.localStorage.getItem(draftKey(token));
    if (raw) {
      try {
        const draft = JSON.parse(raw) as Draft;
        reset(draft.values);
        setStep(draft.step);
        setAttachments(
          draft.attachments
            .filter((a) => a.status === "uploaded")
            .map((a) => ({ ...a, file: null })),
        );
      } catch {
        window.localStorage.removeItem(draftKey(token));
      }
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const values = watch();
  useEffect(() => {
    // No escribir el borrador ANTES de terminar de leerlo (arriba) -- si no,
    // el efecto de hidratación todavía en curso se pisaría a sí mismo con
    // los defaultValues vacíos antes de llegar a aplicar reset().
    if (!hydrated) {
      return;
    }
    const draft: Draft = {
      step,
      values,
      formSessionId,
      attachments: attachments.map((item) => stripFile(item)),
    };
    window.localStorage.setItem(draftKey(token), JSON.stringify(draft));
  }, [hydrated, step, values, token, formSessionId, attachments]);

  // Cola de subida: procesa UN adjunto a la vez, nunca en paralelo -- ver
  // compress-image.ts para el motivo (memoria en un celular viejo). Este
  // efecto se dispara solo, en cadena: termina un item -> cambia
  // `attachments` -> vuelve a correr -> busca el siguiente "queued".
  useEffect(() => {
    if (attachmentsBusy) {
      return;
    }
    const next = attachments.find((a) => a.status === "queued");
    if (!next || !next.file) {
      return;
    }

    setAttachmentsBusy(true);
    setAttachments((current) =>
      current.map((a) =>
        a.id === next.id ? { ...a, status: "processing" } : a,
      ),
    );

    const index = attachments.length;
    uploadFormAttachment(next.file, formSessionId, index)
      .then((uploaded) => {
        setAttachments((current) =>
          current.map((a) =>
            a.id === next.id
              ? {
                  ...a,
                  status: "uploaded",
                  path: uploaded.path,
                  sizeBytes: uploaded.sizeBytes,
                  mimeType: uploaded.mimeType,
                  errorMessage: null,
                }
              : a,
          ),
        );
      })
      .catch((err: unknown) => {
        const message =
          err instanceof AttachmentUploadError
            ? err.message
            : "No pudimos subir este archivo. Revisá tu conexión y probá de nuevo.";
        setAttachments((current) =>
          current.map((a) =>
            a.id === next.id
              ? { ...a, status: "error", errorMessage: message }
              : a,
          ),
        );
      })
      .finally(() => {
        setAttachmentsBusy(false);
      });
  }, [attachments, attachmentsBusy, formSessionId]);

  async function goNext() {
    const fieldsToValidate =
      step === 1 ? IDENTIFICATION_STEP_FIELDS : PROBLEM_STEP_FIELDS;
    const valid = await trigger([...fieldsToValidate]);
    if (valid) {
      setStep((current) => current + 1);
    }
  }

  function goBack() {
    setStep((current) => Math.max(1, current - 1));
  }

  function handleAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    // Permite volver a elegir el mismo archivo más adelante (ej. después de
    // sacarlo de la lista) -- sin esto, el navegador no dispara onChange de
    // nuevo para un archivo ya seleccionado antes.
    event.target.value = "";
    if (files.length === 0) {
      return;
    }
    if (attachments.length + files.length > MAX_TICKET_PHOTOS) {
      setAttachmentError(`Como máximo ${MAX_TICKET_PHOTOS} archivos.`);
      return;
    }
    for (const file of files) {
      const error = validateAttachmentType(file);
      if (error) {
        setAttachmentError(error);
        return;
      }
    }
    setAttachmentError(null);
    setAttachments((current) => [
      ...current,
      ...files.map((file): AttachmentItem => ({
        id: crypto.randomUUID(),
        file,
        status: "queued",
        path: null,
        originalFilename: file.name,
        sizeBytes: file.size,
        mimeType: file.type,
        errorMessage: null,
      })),
    ]);
  }

  function retryAttachment(id: string) {
    setAttachments((current) =>
      current.map((a) =>
        a.id === id ? { ...a, status: "queued", errorMessage: null } : a,
      ),
    );
  }

  function removeAttachment(id: string) {
    const item = attachments.find((a) => a.id === id);
    setAttachments((current) => current.filter((a) => a.id !== id));
    // No bloquea la UI ni se reintenta si falla -- en el peor caso, el
    // archivo queda huérfano bajo pending/, el mismo destino que ya tiene
    // cualquier adjunto de un formulario que se abandona sin confirmar (ver
    // el Pendiente anotado en CLAUDE.md sobre su limpieza periódica).
    if (item?.path) {
      void deleteFormAttachment(item.path);
    }
  }

  const uploadedAttachments = attachments.filter(
    (a) => a.status === "uploaded",
  );
  const attachmentsInFlight = attachments.some(
    (a) => a.status === "queued" || a.status === "processing",
  );

  const selectedCategory = categories.find((c) => c.id === values.categoryId);
  const matchedUnit = units.find((u) => u.id === values.unitId);
  const selectedUnitLabel = values.unitNotListed
    ? values.unitLabelRaw
    : matchedUnit
      ? formatUnitLabel(matchedUnit)
      : null;

  return (
    <Card className="w-full">
      <CardContent className="flex flex-col gap-5">
        <StepProgress step={step} />
        <h2 className="text-ink font-display text-lg font-semibold">
          {PUBLIC_TICKET_STEPS.find((s) => s.id === step)?.title}
        </h2>

        <form noValidate onSubmit={(e) => e.preventDefault()}>
          <FieldGroup>
            {step === 1 && (
              <>
                <Field data-invalid={!!errors.firstName}>
                  <FieldLabel htmlFor="ticket-first-name">Nombre</FieldLabel>
                  <Input
                    id="ticket-first-name"
                    autoComplete="given-name"
                    aria-invalid={!!errors.firstName}
                    {...register("firstName")}
                  />
                  <FieldError errors={[errors.firstName]} />
                </Field>

                <Field data-invalid={!!errors.lastName}>
                  <FieldLabel htmlFor="ticket-last-name">Apellido</FieldLabel>
                  <Input
                    id="ticket-last-name"
                    autoComplete="family-name"
                    placeholder="Opcional"
                    aria-invalid={!!errors.lastName}
                    {...register("lastName")}
                  />
                  <FieldError errors={[errors.lastName]} />
                </Field>

                <Field data-invalid={!!errors.phoneE164}>
                  <FieldLabel htmlFor="ticket-phone">Tu teléfono</FieldLabel>
                  <Input
                    id="ticket-phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="+5493515551234"
                    aria-invalid={!!errors.phoneE164}
                    {...register("phoneE164")}
                  />
                  {!errors.phoneE164 && (
                    <FieldDescription>
                      Para que tu administración te pueda responder.{" "}
                      {AR_WHATSAPP_HELP}
                    </FieldDescription>
                  )}
                  <FieldError errors={[errors.phoneE164]} />
                </Field>

                <Field>
                  <FieldLabel htmlFor="ticket-unit">Tu unidad</FieldLabel>
                  {units.length > 0 ? (
                    <UnitCombobox
                      id="ticket-unit"
                      control={control}
                      units={units}
                    />
                  ) : (
                    // Sin unidades cargadas todavía para este edificio: no
                    // hay nada que buscar, así que directamente pide el
                    // texto libre en vez de mostrar un combo vacío -- ver
                    // el useEffect de arriba, que ya fuerza
                    // unitNotListed=true en este caso.
                    <Input
                      id="ticket-unit"
                      placeholder="Contanos dónde vivís"
                      aria-invalid={!!errors.unitLabelRaw}
                      {...register("unitLabelRaw")}
                    />
                  )}
                  {units.length === 0 && (
                    <FieldError errors={[errors.unitLabelRaw]} />
                  )}
                </Field>

                <Button type="button" className="w-full" onClick={goNext}>
                  Continuar
                </Button>
              </>
            )}

            {step === 2 && (
              <>
                <Field data-invalid={!!errors.categoryId}>
                  <FieldLabel htmlFor="ticket-category">Categoría</FieldLabel>
                  <Controller
                    control={control}
                    name="categoryId"
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger
                          id="ticket-category"
                          aria-invalid={!!errors.categoryId}
                          className="w-full"
                        >
                          <SelectValue placeholder="Elegí una categoría" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((category) => (
                            <SelectItem key={category.id} value={category.id}>
                              {category.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError errors={[errors.categoryId]} />
                </Field>

                <Field data-invalid={!!errors.description}>
                  <FieldLabel htmlFor="ticket-description">
                    Contanos qué pasó
                  </FieldLabel>
                  <Textarea
                    id="ticket-description"
                    rows={5}
                    placeholder="Cuanto más detalle nos des, más rápido lo vamos a poder resolver."
                    aria-invalid={!!errors.description}
                    {...register("description")}
                  />
                  <FieldError errors={[errors.description]} />
                </Field>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={goBack}
                  >
                    Volver
                  </Button>
                  <Button type="button" className="flex-1" onClick={goNext}>
                    Continuar
                  </Button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <Field>
                  <FieldLabel htmlFor="ticket-photos">
                    Sumá fotos si tenés
                  </FieldLabel>
                  <FieldDescription>
                    Ayudan a entender el problema más rápido. También podés
                    sumar un PDF. Podés seguir sin adjuntar nada.
                  </FieldDescription>
                  {/* El input nativo queda oculto: sin estilos propios, el
                      botón/texto que arma el navegador ("Choose Files", en
                      inglés y sin poder tocarse desde HTML) no se puede
                      traducir ni alinear con el resto del formulario --
                      encontrado en la práctica probando el paso 5.2. Se
                      dispara con un botón propio en español. */}
                  <input
                    ref={attachmentInputRef}
                    id="ticket-photos"
                    type="file"
                    accept="image/*,application/pdf"
                    capture="environment"
                    multiple
                    onChange={handleAttachmentChange}
                    className="sr-only"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => attachmentInputRef.current?.click()}
                  >
                    Agregar foto
                  </Button>
                  {attachmentError && (
                    <p className="text-destructive text-sm">
                      {attachmentError}
                    </p>
                  )}
                </Field>

                {attachments.length > 0 && (
                  <ul className="flex flex-col gap-2">
                    {attachments.map((item) => (
                      <AttachmentRow
                        key={item.id}
                        item={item}
                        onRetry={() => retryAttachment(item.id)}
                        onRemove={() => removeAttachment(item.id)}
                      />
                    ))}
                  </ul>
                )}

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={goBack}
                  >
                    Volver
                  </Button>
                  <Button
                    type="button"
                    className="flex-1"
                    disabled={attachmentsInFlight}
                    onClick={() => setStep(4)}
                  >
                    Continuar
                  </Button>
                </div>
                {attachmentsInFlight && (
                  <p className="text-ink-muted text-sm">
                    Esperá a que terminen de subirse los archivos.
                  </p>
                )}
              </>
            )}

            {step === 4 && (
              <>
                <dl className="text-sm">
                  <div className="border-border flex justify-between gap-4 border-b py-2">
                    <dt className="text-ink-muted">Nombre</dt>
                    <dd className="text-ink text-right">
                      {values.firstName} {values.lastName}
                    </dd>
                  </div>
                  <div className="border-border flex justify-between gap-4 border-b py-2">
                    <dt className="text-ink-muted">Teléfono</dt>
                    <dd className="text-ink text-right">{values.phoneE164}</dd>
                  </div>
                  <div className="border-border flex justify-between gap-4 border-b py-2">
                    <dt className="text-ink-muted">Unidad</dt>
                    <dd className="text-ink text-right">{selectedUnitLabel}</dd>
                  </div>
                  <div className="border-border flex justify-between gap-4 border-b py-2">
                    <dt className="text-ink-muted">Categoría</dt>
                    <dd className="text-ink text-right">
                      {selectedCategory?.name}
                    </dd>
                  </div>
                  <div className="border-border flex justify-between gap-4 border-b py-2">
                    <dt className="text-ink-muted">Descripción</dt>
                    <dd className="text-ink max-w-[65%] text-right whitespace-pre-wrap">
                      {values.description}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 py-2">
                    <dt className="text-ink-muted">Adjuntos</dt>
                    <dd className="text-ink text-right">
                      {uploadedAttachments.length === 0
                        ? "Ninguno"
                        : uploadedAttachments.length}
                    </dd>
                  </div>
                </dl>

                <Field>
                  <Button type="button" className="w-full" disabled>
                    Enviar reclamo
                  </Button>
                  <FieldDescription>
                    Todavía estamos conectando este último paso. Probá de nuevo
                    en los próximos días, o comunicate directo con tu
                    administración mientras tanto.
                  </FieldDescription>
                </Field>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={goBack}
                >
                  Volver
                </Button>
              </>
            )}
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

// Una fila por adjunto (paso 5.4): reemplaza la grilla de miniaturas del
// paso 5.2 -- con PDF en la mezcla, no todos los adjuntos son una imagen
// que se pueda previsualizar como thumbnail, y ahora cada uno tiene un
// estado real (subiendo, subido, con error) que hay que mostrar.
function AttachmentRow({
  item,
  onRetry,
  onRemove,
}: {
  item: AttachmentItem;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const isImage = item.mimeType.startsWith("image/");
  const hasPreview = !!item.file && isImage;
  // Preview local desde el propio File en memoria -- nunca se vuelve a leer
  // desde Storage (el bucket no le da SELECT a nadie sin sesión, ver la
  // migración 0019): un item restaurado después de recargar la página
  // (file === null) no tiene preview, se muestra con un ícono genérico.
  //
  // El <img> lo maneja el efecto DIRECTO sobre el DOM (via ref), no un
  // setState -- encontrado en la práctica (paso 5.4), dos problemas
  // distintos con las alternativas:
  // 1) createObjectURL en useMemo + revokeObjectURL en un useEffect
  //    aparte: React Strict Mode (desarrollo) monta/desmonta/vuelve a
  //    montar cada componente una vez para detectar cleanups faltantes --
  //    ese ciclo fantasma revocaba la URL real que el render "de verdad"
  //    seguía usando, la miniatura quedaba rota (`ERR_FILE_NOT_FOUND`,
  //    `naturalWidth: 0`), reproducido y confirmado.
  // 2) Crear Y revocar en el mismo efecto, pero guardando la url en
  //    useState: soluciona lo anterior, pero dispara la regla de React
  //    Compiler "Calling setState synchronously within an effect can
  //    trigger cascading renders" (error, no warning, en este proyecto).
  // Setear `imgRef.current.src` a mano evita las dos: el efecto sincroniza
  // con el DOM (el caso que React documenta como el uso correcto de
  // useEffect), no con el estado de React.
  const imgRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (!item.file || !isImage || !imgRef.current) {
      return;
    }
    const url = URL.createObjectURL(item.file);
    imgRef.current.src = url;
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [item.file, isImage]);

  return (
    <li className="border-border flex items-center gap-3 rounded-lg border p-2">
      <div className="bg-muted flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md">
        {hasPreview ? (
          // eslint-disable-next-line @next/next/no-img-element -- preview local de un File, no un asset servido por Next
          <img
            ref={imgRef}
            alt={item.originalFilename}
            className="h-full w-full object-cover"
          />
        ) : (
          <FileIcon className="text-muted-foreground size-5" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-ink truncate text-sm">
          {item.originalFilename}
        </span>
        <span
          className={cn(
            "text-xs",
            item.status === "error" ? "text-destructive" : "text-ink-muted",
          )}
        >
          {item.status === "queued" && "En espera…"}
          {item.status === "processing" && "Subiendo…"}
          {item.status === "uploaded" && formatBytes(item.sizeBytes)}
          {item.status === "error" &&
            (item.errorMessage ?? "No se pudo subir.")}
        </span>
      </div>
      {item.status === "error" && (
        <button
          type="button"
          aria-label={`Reintentar ${item.originalFilename}`}
          onClick={onRetry}
          className="hover:bg-accent flex size-8 shrink-0 items-center justify-center rounded-full"
        >
          <RotateCw className="size-4" />
        </button>
      )}
      <button
        type="button"
        aria-label={`Sacar ${item.originalFilename}`}
        onClick={onRemove}
        className="hover:bg-accent flex size-8 shrink-0 items-center justify-center rounded-full"
      >
        <X className="size-4" />
      </button>
    </li>
  );
}
