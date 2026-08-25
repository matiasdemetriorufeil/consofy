"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { reminders } from "@/db/schema";
import { authorizedAction } from "@/lib/auth";

import {
  createReminderFormSchema,
  updateReminderFormSchema,
  type ReminderFieldErrors,
  type ReminderFormState,
} from "./reminder-schema";

// Invalida, después de cada mutación de recordatorios (paso 9.1): solo la
// bandeja de nivel superior -- `/panel/buildings/[buildingId]/reminders`
// sigue siendo el placeholder de solo lectura documentado en ese archivo
// (paso 4.2, punto 3), sin ninguna consulta real que revalidar todavía.
function revalidateReminderPaths() {
  revalidatePath("/panel/reminders");
}

function zodIssuesToFieldErrors(error: z.ZodError): ReminderFieldErrors {
  const fieldErrors: ReminderFieldErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !(field in fieldErrors)) {
      fieldErrors[field as keyof ReminderFieldErrors] = issue.message;
    }
  }
  return fieldErrors;
}

// buildingId siempre sale ya resuelto (el edificio elegido en el header, o
// un <select> de edificios activos de la organización cuando la vista es
// "todos los edificios" -- ver ReminderForm), nunca tipeado a mano; aun así
// se valida acá igual que el resto del formulario (CLAUDE.md > Reglas de
// seguridad). La FK compuesta (building_id, organization_id) ->
// buildings(id, organization_id) (ver CLAUDE.md > Integridad entre
// organizaciones) es la defensa real de base contra un buildingId de otra
// organización -- no hace falta duplicar ese chequeo acá.
export const createReminderAction = authorizedAction(
  async (
    context,
    _prevState: ReminderFormState,
    input: unknown,
  ): Promise<ReminderFormState> => {
    const parsed = createReminderFormSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        formError: null,
        fieldErrors: zodIssuesToFieldErrors(parsed.error),
      };
    }

    const { buildingId, ...values } = parsed.data;
    try {
      await db.insert(reminders).values({
        organizationId: context.organization.id,
        buildingId,
        ...values,
      });
    } catch {
      return {
        ok: false,
        formError:
          "No pudimos guardar el recordatorio. Probá de nuevo en un momento.",
        fieldErrors: {},
      };
    }

    revalidateReminderPaths();
    return { ok: true, formError: null, fieldErrors: {} };
  },
);

export const updateReminderAction = authorizedAction(
  async (
    context,
    _prevState: ReminderFormState,
    input: unknown,
  ): Promise<ReminderFormState> => {
    const parsed = updateReminderFormSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        formError: null,
        fieldErrors: zodIssuesToFieldErrors(parsed.error),
      };
    }

    const { id, buildingId, ...values } = parsed.data;
    let updated: { id: string } | undefined;
    try {
      [updated] = await db
        .update(reminders)
        .set(values)
        .where(
          and(
            eq(reminders.id, id),
            eq(reminders.buildingId, buildingId),
            eq(reminders.organizationId, context.organization.id),
            isNull(reminders.deletedAt),
          ),
        )
        .returning({ id: reminders.id });
    } catch {
      return {
        ok: false,
        formError:
          "No pudimos guardar el recordatorio. Probá de nuevo en un momento.",
        fieldErrors: {},
      };
    }

    if (!updated) {
      return {
        ok: false,
        formError:
          "No encontramos ese recordatorio. Puede que ya lo hayan dado de baja.",
        fieldErrors: {},
      };
    }

    revalidateReminderPaths();
    return { ok: true, formError: null, fieldErrors: {} };
  },
);

export type SimpleReminderActionResult = { ok: boolean; error?: string };

// Baja lógica (paso 9.1, punto 3): nunca DELETE físico, mismo criterio que
// softDeleteUnitAction (units/actions.ts). Sin dependencias que advertir
// antes de confirmar -- a diferencia de una unidad, nada referencia un
// recordatorio salvo `notifications.related_reminder_id` (nullable, un
// link informativo, no una FK que bloquee ni que haya que auditar antes de
// dar de baja).
export const softDeleteReminderAction = authorizedAction(
  async (
    context,
    buildingId: string,
    reminderId: string,
  ): Promise<SimpleReminderActionResult> => {
    const parsedBuildingId = z.uuid().safeParse(buildingId);
    const parsedReminderId = z.uuid().safeParse(reminderId);
    if (!parsedBuildingId.success || !parsedReminderId.success) {
      return { ok: false, error: "Recordatorio inválido." };
    }

    const [updated] = await db
      .update(reminders)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(reminders.id, parsedReminderId.data),
          eq(reminders.buildingId, parsedBuildingId.data),
          eq(reminders.organizationId, context.organization.id),
          isNull(reminders.deletedAt),
        ),
      )
      .returning({ id: reminders.id });

    if (!updated) {
      return { ok: false, error: "No encontramos ese recordatorio." };
    }

    revalidateReminderPaths();
    return { ok: true };
  },
);
