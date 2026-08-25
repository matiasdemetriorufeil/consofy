"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
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

import { createReminderAction, updateReminderAction } from "../actions";
import type { ReminderListRow } from "../queries";
import {
  initialReminderFormState,
  RECURRENCE_LABEL,
  REMINDER_RECURRENCES,
  REMINDER_STATUS_LABEL,
  REMINDER_STATUSES,
  reminderFieldsSchema,
  type ReminderFieldsInput,
  type ReminderStatusValue,
} from "../reminder-schema";

// Campos que sí viven en react-hook-form -- ver el comentario de más abajo
// sobre por qué `buildingId`/`status` quedan afuera.
const RHF_MANAGED_FIELDS = new Set<keyof ReminderFieldsInput>([
  "title",
  "description",
  "dueDate",
  "noticeDays",
  "recurrence",
]);

// Un solo formulario para alta y edición (mismo criterio que UnitForm,
// paso 4.3). `buildingId`/`status` viven FUERA de react-hook-form (estado
// propio, no Controller sobre el resolver) a propósito -- mismo motivo que
// UnitForm con `buildingId`: el resolver de Zod (`reminderFieldsSchema`) no
// los incluye, así que si viajaran como parte de los `values` que maneja
// react-hook-form, zodResolver los descartaría del objeto que llega a
// `onSubmit` (strip de campos no declarados en el schema que valida). Se
// mezclan recién en el payload final, después de `handleSubmit`.
//
// `lockedBuildingId`: el edificio elegido en el header (o el de la fila que
// se está editando) -- cuando es `null` (vista "todos los edificios"
// creando un recordatorio nuevo), el formulario pide el edificio con un
// <select> propio en vez de asumir uno. En edición, `reminder.buildingId`
// SIEMPRE gana sobre el edificio seleccionado en el header -- un
// recordatorio no cambia de edificio al editarlo, ni siquiera mirando la
// vista agregada.
export function ReminderForm({
  buildingOptions,
  lockedBuildingId,
  reminder,
  onSuccess,
}: {
  buildingOptions: ActiveBuildingOption[];
  lockedBuildingId: string | null;
  reminder?: ReminderListRow;
  onSuccess: () => void;
}) {
  const mode = reminder ? "edit" : "create";
  const action = mode === "edit" ? updateReminderAction : createReminderAction;
  const [state, dispatch, isPending] = useActionState(
    action,
    initialReminderFormState,
  );

  const [buildingId, setBuildingId] = useState(
    reminder?.buildingId ?? lockedBuildingId ?? "",
  );
  const [status, setStatus] = useState<ReminderStatusValue>(
    reminder?.status ?? "pending",
  );

  const {
    register,
    handleSubmit,
    control,
    setError,
    setFocus,
    formState: { errors },
  } = useForm<ReminderFieldsInput>({
    resolver: zodResolver(reminderFieldsSchema),
    defaultValues: reminder
      ? {
          title: reminder.title,
          description: reminder.description ?? "",
          dueDate: reminder.dueDate,
          noticeDays: reminder.noticeDays,
          recurrence: reminder.recurrence,
        }
      : {
          title: "",
          description: "",
          dueDate: "",
          noticeDays: 7,
          recurrence: "none",
        },
  });

  // Mismo patrón que BuildingForm/UnitForm: reacciona a cada resolución
  // nueva de la Server Action.
  useEffect(() => {
    if (state.ok) {
      onSuccess();
      return;
    }

    const entries = Object.entries(state.fieldErrors) as [
      keyof ReminderFieldsInput,
      string,
    ][];
    let firstField: keyof ReminderFieldsInput | null = null;
    for (const [field, message] of entries) {
      // `buildingId`/`status` no son campos de react-hook-form (ver el
      // comentario de arriba) -- sus errores de servidor se leen aparte
      // (`buildingError` más abajo; `status` no tiene validación propia
      // más allá del enum del <select>, no necesita este mecanismo).
      if (!RHF_MANAGED_FIELDS.has(field)) {
        continue;
      }
      setError(field, { type: "server", message });
      firstField ??= field;
    }
    if (firstField) {
      setFocus(firstField);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const buildingError = !state.ok ? state.fieldErrors.buildingId : undefined;

  return (
    <form
      noValidate
      onSubmit={handleSubmit((data) => {
        const payload = reminder
          ? {
              ...data,
              id: reminder.id,
              buildingId: reminder.buildingId,
              status,
            }
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

        {/* Sin edificio fijo (vista "todos los edificios", solo al crear):
            el formulario tiene que pedirlo, un recordatorio siempre
            pertenece a UN edificio puntual (reminders.building_id NOT
            NULL). En edición, o con un edificio elegido en el header, esto
            no se muestra -- el contexto ya lo deja claro. */}
        {mode === "create" && !lockedBuildingId && (
          <Field data-invalid={!!buildingError}>
            <FieldLabel htmlFor="reminder-building">Edificio</FieldLabel>
            <Select
              value={buildingId}
              onValueChange={setBuildingId}
              disabled={isPending}
            >
              <SelectTrigger
                id="reminder-building"
                aria-invalid={!!buildingError}
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
              errors={[buildingError ? { message: buildingError } : undefined]}
            />
          </Field>
        )}

        <Field data-invalid={!!errors.title}>
          <FieldLabel htmlFor="reminder-title">Título</FieldLabel>
          <Input
            id="reminder-title"
            autoComplete="off"
            placeholder="Ej: Fumigación, service del ascensor"
            aria-invalid={!!errors.title}
            disabled={isPending}
            {...register("title")}
          />
          <FieldError errors={[errors.title]} />
        </Field>

        <Field data-invalid={!!errors.description}>
          <FieldLabel htmlFor="reminder-description">Descripción</FieldLabel>
          <Textarea
            id="reminder-description"
            placeholder="Opcional"
            aria-invalid={!!errors.description}
            disabled={isPending}
            {...register("description")}
          />
          <FieldError errors={[errors.description]} />
        </Field>

        <Field data-invalid={!!errors.dueDate}>
          <FieldLabel htmlFor="reminder-due-date">
            Fecha de vencimiento
          </FieldLabel>
          <Input
            id="reminder-due-date"
            type="date"
            aria-invalid={!!errors.dueDate}
            disabled={isPending}
            {...register("dueDate")}
          />
          <FieldError errors={[errors.dueDate]} />
        </Field>

        <Field data-invalid={!!errors.noticeDays}>
          <FieldLabel htmlFor="reminder-notice-days">
            Días de anticipación
          </FieldLabel>
          <Input
            id="reminder-notice-days"
            type="number"
            min={0}
            max={365}
            aria-invalid={!!errors.noticeDays}
            disabled={isPending}
            {...register("noticeDays", { valueAsNumber: true })}
          />
          <FieldError errors={[errors.noticeDays]} />
        </Field>

        <Field data-invalid={!!errors.recurrence}>
          <FieldLabel htmlFor="reminder-recurrence">Recurrencia</FieldLabel>
          <Controller
            control={control}
            name="recurrence"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={field.onChange}
                disabled={isPending}
              >
                <SelectTrigger
                  id="reminder-recurrence"
                  aria-invalid={!!errors.recurrence}
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REMINDER_RECURRENCES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {RECURRENCE_LABEL[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError errors={[errors.recurrence]} />
        </Field>

        {/* Estado: solo editable en edición -- un recordatorio nuevo
            siempre nace "pending" del lado del servidor (ver actions.ts).
            Es la única forma que tiene este paso de moverlo a otro estado
            sin construir el flujo de recurrencia/notificaciones, fuera de
            alcance acá (ver reminder-schema.ts). */}
        {mode === "edit" && (
          <Field>
            <FieldLabel htmlFor="reminder-status">Estado</FieldLabel>
            <Select
              value={status}
              onValueChange={(value) => setStatus(value as ReminderStatusValue)}
              disabled={isPending}
            >
              <SelectTrigger id="reminder-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REMINDER_STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {REMINDER_STATUS_LABEL[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}

        <Button type="submit" disabled={isPending} className="w-full">
          {isPending
            ? "Guardando…"
            : mode === "edit"
              ? "Guardar cambios"
              : "Crear recordatorio"}
        </Button>
      </FieldGroup>
    </form>
  );
}
