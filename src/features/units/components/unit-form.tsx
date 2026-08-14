"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { startTransition, useActionState, useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";

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
import { UNIT_TYPE_LABEL } from "@/features/buildings/unit-type";

import {
  checkUnitAvailableAction,
  createUnitAction,
  updateUnitAction,
} from "../actions";
import type { BuildingUnitRow } from "../queries";
import {
  initialUnitFormState,
  UNIT_TYPES,
  unitFormSchema,
  type UnitFormInput,
} from "../unit-schema";

// Mismo umbral que BuildingForm (paso 4.1) para la validación en vivo del
// prefijo -- ni tan corto que dispare una consulta por tecla, ni tan largo
// que se sienta desconectado.
const AVAILABILITY_DEBOUNCE_MS = 400;

type AvailabilityState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available" }
  | { status: "taken" };

const DUPLICATE_MESSAGE = "Ya existe una unidad con esa torre, piso y número.";

export function UnitForm({
  buildingId,
  unit,
  onSuccess,
}: {
  buildingId: string;
  unit?: BuildingUnitRow;
  onSuccess: () => void;
}) {
  const mode = unit ? "edit" : "create";
  const action = mode === "edit" ? updateUnitAction : createUnitAction;
  const [state, dispatch, isPending] = useActionState(
    action,
    initialUnitFormState,
  );

  const {
    register,
    handleSubmit,
    control,
    watch,
    setError,
    setFocus,
    formState: { errors },
  } = useForm<UnitFormInput>({
    resolver: zodResolver(unitFormSchema),
    defaultValues: unit
      ? {
          tower: unit.tower ?? "",
          floor: unit.floor,
          number: unit.number,
          type: unit.type,
        }
      : { tower: "", floor: "", number: "", type: "apartment" },
  });

  const [availability, setAvailability] = useState<AvailabilityState>({
    status: "idle",
  });
  const towerValue = watch("tower");
  const floorValue = watch("floor");
  const numberValue = watch("number");

  // Validación en vivo de duplicados (paso 4.3), con debounce -- mismo
  // patrón que el chequeo de prefijo de BuildingForm (paso 4.1). No es la
  // defensa real (esa es el índice único parcial de la base, traducido en
  // translateUnitError() para el caso de carrera).
  useEffect(() => {
    const floor = (floorValue ?? "").trim();
    const number = (numberValue ?? "").trim();
    if (!floor || !number) {
      setAvailability({ status: "idle" });
      return;
    }

    setAvailability({ status: "checking" });
    const timeout = setTimeout(() => {
      startTransition(async () => {
        const result = await checkUnitAvailableAction(
          buildingId,
          (towerValue ?? "").trim() || null,
          floor,
          number,
          unit?.id,
        );
        setAvailability(
          result.available ? { status: "available" } : { status: "taken" },
        );
      });
    }, AVAILABILITY_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [buildingId, towerValue, floorValue, numberValue, unit?.id]);

  // Mismo patrón que BuildingForm: reacciona a cada resolución nueva de la
  // Server Action, éxito o errores de campo.
  useEffect(() => {
    if (state.ok) {
      onSuccess();
      return;
    }

    const entries = Object.entries(state.fieldErrors) as [
      keyof UnitFormInput,
      string,
    ][];
    let firstField: keyof UnitFormInput | null = null;
    for (const [field, message] of entries) {
      setError(field, { type: "server", message });
      firstField ??= field;
    }
    if (firstField) {
      setFocus(firstField);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form
      noValidate
      onSubmit={handleSubmit((data) => {
        if (availability.status === "taken") {
          setError("number", { type: "live", message: DUPLICATE_MESSAGE });
          setFocus("number");
          return;
        }
        const payload = unit
          ? { ...data, id: unit.id, buildingId }
          : { ...data, buildingId };
        startTransition(() => dispatch(payload));
      })}
    >
      <FieldGroup>
        {state.formError && (
          <Alert variant="destructive">
            <AlertDescription>{state.formError}</AlertDescription>
          </Alert>
        )}

        <Field data-invalid={!!errors.tower}>
          <FieldLabel htmlFor="unit-tower">Torre</FieldLabel>
          <Input
            id="unit-tower"
            autoComplete="off"
            placeholder="Opcional -- dejalo vacío si el edificio no tiene torres"
            aria-invalid={!!errors.tower}
            disabled={isPending}
            {...register("tower")}
          />
          <FieldError errors={[errors.tower]} />
        </Field>

        <Field data-invalid={!!errors.floor}>
          <FieldLabel htmlFor="unit-floor">Piso</FieldLabel>
          <Input
            id="unit-floor"
            autoComplete="off"
            placeholder="Ej: 3, PB, Subsuelo 1"
            aria-invalid={!!errors.floor}
            disabled={isPending}
            {...register("floor")}
          />
          <FieldError errors={[errors.floor]} />
        </Field>

        <Field data-invalid={!!errors.number}>
          <FieldLabel htmlFor="unit-number">
            Número o letra de departamento
          </FieldLabel>
          <Input
            id="unit-number"
            autoComplete="off"
            placeholder="Ej: A, 12, Local 3"
            aria-invalid={!!errors.number}
            disabled={isPending}
            {...register("number")}
          />
          {!errors.number && availability.status === "checking" && (
            <FieldDescription>Verificando disponibilidad…</FieldDescription>
          )}
          {!errors.number && availability.status === "available" && (
            <FieldDescription className="text-resuelto">
              Disponible.
            </FieldDescription>
          )}
          {!errors.number && availability.status === "taken" && (
            <FieldDescription className="text-destructive">
              {DUPLICATE_MESSAGE}
            </FieldDescription>
          )}
          <FieldError errors={[errors.number]} />
        </Field>

        <Field data-invalid={!!errors.type}>
          <FieldLabel htmlFor="unit-type">Tipo</FieldLabel>
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={field.onChange}
                disabled={isPending}
              >
                <SelectTrigger
                  id="unit-type"
                  aria-invalid={!!errors.type}
                  className="w-full"
                >
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
          <FieldError errors={[errors.type]} />
        </Field>

        <Button type="submit" disabled={isPending} className="w-full">
          {isPending
            ? "Guardando…"
            : mode === "edit"
              ? "Guardar cambios"
              : "Crear unidad"}
        </Button>
      </FieldGroup>
    </form>
  );
}
