"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { X } from "lucide-react";

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

import type { PublicFormCategory } from "../queries";
import {
  IDENTIFICATION_STEP_FIELDS,
  MAX_TICKET_PHOTOS,
  PROBLEM_STEP_FIELDS,
  PUBLIC_TICKET_STEPS,
  TOTAL_STEPS,
  publicTicketFormSchema,
  validatePhotoFile,
  type PublicTicketFormInput,
} from "../ticket-schema";
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

type Draft = {
  step: number;
  values: PublicTicketFormInput;
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
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

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
  // Las FOTOS quedan afuera a propósito: un File no sobrevive
  // JSON.stringify, y guardarlas como base64 arriesgaría llenar la cuota de
  // localStorage con apenas un par de fotos de celular actuales (varios MB
  // cada una). Si el navegador se cierra en el paso 3, el vecino recupera
  // sus datos y su problema descripto, pero tiene que volver a elegir las
  // fotos -- trade-off aceptado, documentado también en el reporte.
  useEffect(() => {
    const raw = window.localStorage.getItem(draftKey(token));
    if (raw) {
      try {
        const draft = JSON.parse(raw) as Draft;
        reset(draft.values);
        setStep(draft.step);
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
    const draft: Draft = { step, values };
    window.localStorage.setItem(draftKey(token), JSON.stringify(draft));
  }, [hydrated, step, values, token]);

  const photoPreviews = useMemo(
    () => photos.map((file) => URL.createObjectURL(file)),
    [photos],
  );
  useEffect(() => {
    return () => {
      photoPreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [photoPreviews]);

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

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    // Permite volver a elegir el mismo archivo más adelante (ej. después de
    // sacarlo de la lista) -- sin esto, el navegador no dispara onChange de
    // nuevo para un archivo ya seleccionado antes.
    event.target.value = "";
    if (files.length === 0) {
      return;
    }
    if (photos.length + files.length > MAX_TICKET_PHOTOS) {
      setPhotoError(`Como máximo ${MAX_TICKET_PHOTOS} fotos.`);
      return;
    }
    for (const file of files) {
      const error = validatePhotoFile(file);
      if (error) {
        setPhotoError(error);
        return;
      }
    }
    setPhotoError(null);
    setPhotos((current) => [...current, ...files]);
  }

  function removePhoto(index: number) {
    setPhotos((current) => current.filter((_, i) => i !== index));
  }

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
                    Ayudan a entender el problema más rápido. Podés seguir sin
                    sacar ninguna.
                  </FieldDescription>
                  {/* El input nativo queda oculto: sin estilos propios, el
                      botón/texto que arma el navegador ("Choose Files", en
                      inglés y sin poder tocarse desde HTML) no se puede
                      traducir ni alinear con el resto del formulario --
                      encontrado en la práctica probando este mismo paso.
                      Se dispara con un botón propio en español. */}
                  <input
                    ref={photoInputRef}
                    id="ticket-photos"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    onChange={handlePhotoChange}
                    className="sr-only"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => photoInputRef.current?.click()}
                  >
                    Agregar foto
                  </Button>
                  {photoError && (
                    <p className="text-destructive text-sm">{photoError}</p>
                  )}
                </Field>

                {photos.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {photos.map((photo, index) => (
                      <div
                        key={`${photo.name}-${photo.lastModified}-${index}`}
                        className="group relative aspect-square"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- preview local de un File, no un asset servido por Next */}
                        <img
                          src={photoPreviews[index]}
                          alt={`Foto ${index + 1}`}
                          className="h-full w-full rounded-lg object-cover"
                        />
                        <button
                          type="button"
                          aria-label={`Sacar foto ${index + 1}`}
                          onClick={() => removePhoto(index)}
                          className="bg-card ring-foreground/10 absolute top-1 right-1 flex size-6 items-center justify-center rounded-full ring-1"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
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
                    onClick={() => setStep(4)}
                  >
                    Continuar
                  </Button>
                </div>
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
                    <dt className="text-ink-muted">Fotos</dt>
                    <dd className="text-ink text-right">
                      {photos.length === 0 ? "Ninguna" : photos.length}
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
