"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useState,
  useTransition,
} from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { UNIT_TYPE_LABEL } from "@/features/buildings/unit-type";

import { createUnitsBulkAction, previewBulkUnitsAction } from "../actions";
import {
  BULK_MAX_UNITS,
  initialBulkPreviewState,
  UNIT_TYPES,
  type BulkUnitCandidate,
  type BulkUnitsFormOutput,
} from "../unit-schema";

// Cuántas unidades "ya existentes" se listan en la previsualización antes
// de resumir el resto -- en el caso normal esta lista está vacía o tiene
// pocas; si alguien previsualiza un rango enorme que ya casi todo existe,
// esto evita que el diálogo se vuelva una pared de texto (paso 4.3, "sin
// que asuste").
const MAX_CONFLICT_PREVIEW = 20;

type RangeFormValues = Omit<BulkUnitsFormOutput, "buildingId">;

const DEFAULT_VALUES: RangeFormValues = {
  tower: null,
  type: "apartment",
  floorStart: 1,
  floorEnd: 1,
  numberMode: "letters",
  letterStart: "A",
  letterEnd: "A",
  numberStart: 1,
  numberEnd: 1,
};

function unitLabel(candidate: BulkUnitCandidate): string {
  return candidate.tower
    ? `${candidate.tower} - ${candidate.floor}°${candidate.number}`
    : `${candidate.floor}°${candidate.number}`;
}

// Creación masiva (paso 4.3): dos pasos, nunca uno solo -- "pisos 1 a 10,
// departamentos A a D" con PREVISUALIZACIÓN antes de confirmar (pedido
// explícito del enunciado). El paso 1 (este formulario de rangos) solo
// CALCULA, nunca escribe; el paso 2 (la previsualización) es la única
// pantalla desde la que se puede confirmar de verdad. Ningún número mágico
// oculto: lo que se previsualiza es exactamente lo que se va a crear
// (generateBulkUnitCandidates() corre en el servidor una sola vez, con la
// misma función para las dos pantallas).
export function BulkUnitsDialog({
  buildingId,
  open,
  onOpenChange,
}: {
  buildingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [previewState, previewDispatch, isPreviewPending] = useActionState(
    previewBulkUnitsAction,
    initialBulkPreviewState,
  );
  const [showForm, setShowForm] = useState(true);
  const [isCreating, startCreating] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<RangeFormValues>({ defaultValues: DEFAULT_VALUES });

  const numberMode = watch("numberMode");

  // Pasa a la pantalla de confirmación apenas llega una previsualización
  // nueva ("ready") -- depende solo de `previewState` a propósito, mismo
  // criterio que BuildingForm (paso 4.1): ese objeto cambia de referencia
  // en cada dispatch, así que esto corre una vez por cada previsualización
  // nueva, no en cada render.
  useEffect(() => {
    if (previewState.status === "ready") {
      setShowForm(false);
    }
  }, [previewState]);

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      setShowForm(true);
    }
    onOpenChange(nextOpen);
  }

  function handleConfirm() {
    if (previewState.status !== "ready") {
      return;
    }
    startCreating(async () => {
      const result = await createUnitsBulkAction(
        buildingId,
        previewState.toCreate,
      );
      if (result.ok) {
        handleClose(false);
        toast.success(
          result.createdCount === 1
            ? "Se creó 1 unidad."
            : `Se crearon ${result.createdCount} unidades.`,
        );
      } else {
        toast.error(result.error ?? "No pudimos crear las unidades.");
      }
    });
  }

  const showPreview = previewState.status === "ready" && !showForm;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Crear varias unidades</DialogTitle>
          <DialogDescription>
            Generá un rango de departamentos de una sola vez -- por ejemplo,
            pisos 1 a 10 con departamentos A a D. Hasta {BULK_MAX_UNITS}{" "}
            unidades por tanda.
          </DialogDescription>
        </DialogHeader>

        {!showPreview && (
          <form
            noValidate
            onSubmit={handleSubmit((data) => {
              startTransition(() => previewDispatch({ ...data, buildingId }));
            })}
          >
            <FieldGroup>
              {previewState.status === "error" && previewState.formError && (
                <Alert variant="destructive">
                  <AlertDescription>{previewState.formError}</AlertDescription>
                </Alert>
              )}

              <Field>
                <FieldLabel htmlFor="bulk-tower">Torre</FieldLabel>
                <Input
                  id="bulk-tower"
                  autoComplete="off"
                  placeholder="Opcional -- se aplica a todas las unidades de esta tanda"
                  disabled={isPreviewPending}
                  {...register("tower")}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="bulk-floor-start">Piso desde</FieldLabel>
                  <Input
                    id="bulk-floor-start"
                    type="number"
                    min={1}
                    disabled={isPreviewPending}
                    aria-invalid={!!errors.floorStart}
                    {...register("floorStart", { valueAsNumber: true })}
                  />
                  <FieldError errors={[errors.floorStart]} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="bulk-floor-end">Piso hasta</FieldLabel>
                  <Input
                    id="bulk-floor-end"
                    type="number"
                    min={1}
                    disabled={isPreviewPending}
                    aria-invalid={!!errors.floorEnd}
                    {...register("floorEnd", { valueAsNumber: true })}
                  />
                  <FieldError errors={[errors.floorEnd]} />
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor="bulk-number-mode">
                  Departamentos identificados con
                </FieldLabel>
                <Controller
                  control={control}
                  name="numberMode"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isPreviewPending}
                    >
                      <SelectTrigger id="bulk-number-mode" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="letters">
                          Letras (A, B, C…)
                        </SelectItem>
                        <SelectItem value="numbers">
                          Números (1, 2, 3…)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>

              {numberMode === "letters" ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field>
                    <FieldLabel htmlFor="bulk-letter-start">
                      Letra desde
                    </FieldLabel>
                    <Input
                      id="bulk-letter-start"
                      autoComplete="off"
                      maxLength={1}
                      className="uppercase"
                      disabled={isPreviewPending}
                      aria-invalid={!!errors.letterStart}
                      {...register("letterStart")}
                    />
                    <FieldError errors={[errors.letterStart]} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="bulk-letter-end">
                      Letra hasta
                    </FieldLabel>
                    <Input
                      id="bulk-letter-end"
                      autoComplete="off"
                      maxLength={1}
                      className="uppercase"
                      disabled={isPreviewPending}
                      aria-invalid={!!errors.letterEnd}
                      {...register("letterEnd")}
                    />
                    <FieldError errors={[errors.letterEnd]} />
                  </Field>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Field>
                    <FieldLabel htmlFor="bulk-number-start">
                      Número desde
                    </FieldLabel>
                    <Input
                      id="bulk-number-start"
                      type="number"
                      min={1}
                      disabled={isPreviewPending}
                      aria-invalid={!!errors.numberStart}
                      {...register("numberStart", { valueAsNumber: true })}
                    />
                    <FieldError errors={[errors.numberStart]} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="bulk-number-end">
                      Número hasta
                    </FieldLabel>
                    <Input
                      id="bulk-number-end"
                      type="number"
                      min={1}
                      disabled={isPreviewPending}
                      aria-invalid={!!errors.numberEnd}
                      {...register("numberEnd", { valueAsNumber: true })}
                    />
                    <FieldError errors={[errors.numberEnd]} />
                  </Field>
                </div>
              )}

              <Field>
                <FieldLabel htmlFor="bulk-type">Tipo</FieldLabel>
                <Controller
                  control={control}
                  name="type"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isPreviewPending}
                    >
                      <SelectTrigger id="bulk-type" className="w-full">
                        <SelectValue placeholder="Elegí un tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        {UNIT_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {UNIT_TYPE_LABEL[type]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldDescription>
                  Se aplica a todas las unidades que se generen en esta tanda.
                </FieldDescription>
              </Field>

              <Button
                type="submit"
                disabled={isPreviewPending}
                className="w-full"
              >
                {isPreviewPending ? "Calculando…" : "Previsualizar"}
              </Button>
            </FieldGroup>
          </form>
        )}

        {showPreview && previewState.status === "ready" && (
          <div className="flex flex-col gap-4">
            <p className="text-ink text-sm">
              {previewState.toCreate.length === 0 ? (
                "Todas las unidades de este rango ya existen -- no hay nada nuevo para crear."
              ) : (
                <>
                  Se{" "}
                  {previewState.toCreate.length === 1
                    ? "va a crear 1 unidad nueva"
                    : `van a crear ${previewState.toCreate.length} unidades nuevas`}
                  .
                </>
              )}
            </p>

            {previewState.alreadyExisting.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-ink-muted text-sm">
                  {previewState.alreadyExisting.length === 1
                    ? "Esta unidad ya existe en el edificio y no se va a duplicar:"
                    : `Estas ${previewState.alreadyExisting.length} unidades ya existen en el edificio y no se van a duplicar:`}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {previewState.alreadyExisting
                    .slice(0, MAX_CONFLICT_PREVIEW)
                    .map((candidate) => (
                      <Badge
                        key={unitLabel(candidate)}
                        variant="secondary"
                        className="font-mono"
                      >
                        {unitLabel(candidate)}
                      </Badge>
                    ))}
                  {previewState.alreadyExisting.length >
                    MAX_CONFLICT_PREVIEW && (
                    <Badge variant="secondary">
                      +
                      {previewState.alreadyExisting.length -
                        MAX_CONFLICT_PREVIEW}{" "}
                      más
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {showPreview ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={isCreating}
                onClick={() => setShowForm(true)}
              >
                Volver a editar
              </Button>
              <Button
                type="button"
                disabled={
                  isCreating ||
                  previewState.status !== "ready" ||
                  previewState.toCreate.length === 0
                }
                onClick={handleConfirm}
              >
                {isCreating
                  ? "Creando…"
                  : previewState.status === "ready"
                    ? `Crear ${previewState.toCreate.length} unidades`
                    : "Crear"}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={isPreviewPending}
              onClick={() => handleClose(false)}
            >
              Cancelar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
