"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { people, unitOccupancies } from "@/db/schema";
import { authorizedAction } from "@/lib/auth";
import { AR_WHATSAPP_E164_REGEX, normalizePhoneInput } from "@/lib/phone";
import {
  CHECK_VIOLATION,
  UNIQUE_VIOLATION,
  unwrapPostgresError,
} from "@/lib/postgres-errors";

import {
  OCCUPANCY_ENDED_ON_CHECK,
  PERSON_UNIT_ONGOING_UNIQUE_CONSTRAINT,
  PHONE_FORMAT_CHECK,
  PHONE_UNIQUE_CONSTRAINT,
  PRIMARY_UNIQUE_CONSTRAINT,
} from "./constraints";
import {
  closeOccupancyFormSchema,
  createPersonWithOccupancyFormSchema,
  updatePersonFormSchema,
  type PersonFieldErrors,
  type PersonFormState,
} from "./person-schema";
import {
  findPersonByPhone,
  getPersonDependencyCounts,
  unitBelongsToBuilding,
  type PersonDependencyCounts,
  type PersonPhoneMatch,
} from "./queries";

// Invalida, después de cada mutación de personas/ocupaciones (paso 4.4):
// la pestaña Personas del edificio -- el patrón LITERAL con corchetes
// revalida para CUALQUIER buildingId, mismo criterio que
// revalidateUnitPaths() en units/actions.ts.
function revalidatePersonPaths() {
  revalidatePath("/panel/buildings/[buildingId]/people");
}

function zodIssuesToFieldErrors(error: z.ZodError): PersonFieldErrors {
  const fieldErrors: PersonFieldErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !(field in fieldErrors)) {
      fieldErrors[field as keyof PersonFieldErrors] = issue.message;
    }
  }
  return fieldErrors;
}

// Traduce el error de Postgres cuando el INSERT/UPDATE de una persona
// choca contra el índice único parcial del teléfono (people_organization_id
// _phone_e164_unique, ver people.ts) -- nunca se devuelve el error crudo de
// la base, mismo criterio que translateBuildingError()/translateUnitError().
// En el uso normal este caso ya lo evita checkPersonByPhoneAction() ANTES
// de enviar el formulario (decisión 1 del reporte); esto es el backstop
// real para la carrera (dos pestañas cargando el mismo teléfono a la vez).
function translatePersonError(rawError: unknown): PersonFormState {
  const error = unwrapPostgresError(rawError);
  if (error) {
    if (
      error.code === UNIQUE_VIOLATION &&
      error.constraint_name === PHONE_UNIQUE_CONSTRAINT
    ) {
      return {
        ok: false,
        formError: null,
        fieldErrors: {
          phoneE164: "Ya hay un vecino con ese teléfono en esta organización.",
        },
      };
    }
    if (
      error.code === CHECK_VIOLATION &&
      error.constraint_name === PHONE_FORMAT_CHECK
    ) {
      return {
        ok: false,
        formError: null,
        fieldErrors: { phoneE164: "El teléfono no tiene un formato válido." },
      };
    }
  }

  return {
    ok: false,
    formError: "No pudimos guardar el vecino. Probá de nuevo en un momento.",
    fieldErrors: {},
  };
}

// Traduce el error de Postgres cuando el INSERT de una ocupación choca
// contra alguno de los dos índices únicos parciales de unit_occupancies
// (ver unit-occupancies.ts). El de "contacto principal" es, en el flujo
// normal, inalcanzable -- createPersonWithOccupancyAction ya desmarca al
// principal anterior DENTRO de la misma transacción (decisión del reporte
// sobre el constraint de un solo contacto principal); esto es el backstop
// para una carrera real (dos pestañas marcando principal a la vez). El de
// "misma persona, misma unidad, las dos vigentes" (sin importar el rol,
// desde el cierre de 4.4) SÍ es alcanzable en uso normal (alguien intenta
// asignar de nuevo a quien ya es propietario o inquilino vigente de esa
// unidad, con cualquier rol).
function translateOccupancyError(rawError: unknown): PersonFormState {
  const error = unwrapPostgresError(rawError);
  if (error && error.code === UNIQUE_VIOLATION) {
    if (error.constraint_name === PRIMARY_UNIQUE_CONSTRAINT) {
      return {
        ok: false,
        formError:
          "Ya se asignó otro contacto principal para esta unidad. Actualizá la página e intentá de nuevo.",
        fieldErrors: {},
      };
    }
    if (error.constraint_name === PERSON_UNIT_ONGOING_UNIQUE_CONSTRAINT) {
      return {
        ok: false,
        formError: null,
        fieldErrors: {
          unitId: "Esta persona ya tiene una ocupación vigente en esta unidad.",
        },
      };
    }
  }

  return {
    ok: false,
    formError:
      "No pudimos asignar al vecino a la unidad. Probá de nuevo en un momento.",
    fieldErrors: {},
  };
}

// Alta combinada de persona + ocupación (paso 4.4). Ver el comentario de
// createPersonWithOccupancyFormSchema (person-schema.ts) para las dos
// ramas ("new"/"existing"). Todo corre en una transacción: si el
// desmarcado del contacto principal anterior o el INSERT de la ocupación
// fallan, la persona recién creada (rama "new") tampoco queda guardada --
// nunca una persona "huérfana" sin ninguna ocupación por un error a mitad
// de camino.
export const createPersonWithOccupancyAction = authorizedAction(
  async (
    context,
    _prevState: PersonFormState,
    input: unknown,
  ): Promise<PersonFormState> => {
    const parsed = createPersonWithOccupancyFormSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        formError: null,
        fieldErrors: zodIssuesToFieldErrors(parsed.error),
      };
    }

    const data = parsed.data;

    const unitOk = await unitBelongsToBuilding(
      context.organization.id,
      data.buildingId,
      data.unitId,
    );
    if (!unitOk) {
      return {
        ok: false,
        formError: "Esa unidad no pertenece a este edificio.",
        fieldErrors: {},
      };
    }

    if (data.mode === "existing") {
      const [existingPerson] = await db
        .select({ id: people.id })
        .from(people)
        .where(
          and(
            eq(people.id, data.personId),
            eq(people.organizationId, context.organization.id),
            isNull(people.deletedAt),
          ),
        );
      if (!existingPerson) {
        return {
          ok: false,
          formError:
            "No encontramos ese vecino. Puede que lo hayan dado de baja.",
          fieldErrors: {},
        };
      }
    }

    try {
      await db.transaction(async (tx) => {
        let personId: string;

        if (data.mode === "new") {
          const [inserted] = await tx
            .insert(people)
            .values({
              organizationId: context.organization.id,
              firstName: data.firstName,
              lastName: data.lastName,
              phoneE164: data.phoneE164,
              email: data.email,
              notes: data.notes,
            })
            .returning({ id: people.id });
          if (!inserted) {
            throw new Error("No pudimos crear el vecino.");
          }
          personId = inserted.id;
        } else {
          personId = data.personId;
        }

        // Un solo contacto principal vigente por unidad (ver
        // unit_occupancies_primary_per_unit_unique en unit-occupancies.ts):
        // en vez de dejar que la base rechace el INSERT cuando ya hay uno,
        // se desmarca acá al anterior -- la UI lo explica como "el
        // principal anterior deja de serlo", no como un error a corregir.
        if (data.isPrimary) {
          await tx
            .update(unitOccupancies)
            .set({ isPrimary: false })
            .where(
              and(
                eq(unitOccupancies.unitId, data.unitId),
                eq(unitOccupancies.organizationId, context.organization.id),
                eq(unitOccupancies.isPrimary, true),
                isNull(unitOccupancies.endedOn),
                isNull(unitOccupancies.deletedAt),
              ),
            );
        }

        await tx.insert(unitOccupancies).values({
          organizationId: context.organization.id,
          unitId: data.unitId,
          personId,
          role: data.role,
          isPrimary: data.isPrimary,
          startedOn: data.startedOn,
        });
      });
    } catch (error) {
      const pgError = unwrapPostgresError(error);
      if (pgError?.constraint_name === PHONE_UNIQUE_CONSTRAINT) {
        return translatePersonError(pgError);
      }
      if (
        pgError?.constraint_name === PRIMARY_UNIQUE_CONSTRAINT ||
        pgError?.constraint_name === PERSON_UNIT_ONGOING_UNIQUE_CONSTRAINT
      ) {
        return translateOccupancyError(pgError);
      }
      return {
        ok: false,
        formError:
          "No pudimos guardar al vecino. Probá de nuevo en un momento.",
        fieldErrors: {},
      };
    }

    revalidatePersonPaths();
    return { ok: true, formError: null, fieldErrors: {} };
  },
);

// Edición de los datos propios de una persona (paso 4.4) -- nunca toca sus
// ocupaciones, eso es closeOccupancyAction/createPersonWithOccupancyAction
// por separado.
export const updatePersonAction = authorizedAction(
  async (
    context,
    _prevState: PersonFormState,
    input: unknown,
  ): Promise<PersonFormState> => {
    const parsed = updatePersonFormSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        formError: null,
        fieldErrors: zodIssuesToFieldErrors(parsed.error),
      };
    }

    const { id, ...values } = parsed.data;
    let updated: { id: string } | undefined;
    try {
      [updated] = await db
        .update(people)
        .set(values)
        .where(
          and(
            eq(people.id, id),
            eq(people.organizationId, context.organization.id),
            isNull(people.deletedAt),
          ),
        )
        .returning({ id: people.id });
    } catch (error) {
      return translatePersonError(error);
    }

    if (!updated) {
      return {
        ok: false,
        formError:
          "No encontramos ese vecino. Puede que ya lo hayan dado de baja.",
        fieldErrors: {},
      };
    }

    revalidatePersonPaths();
    return { ok: true, formError: null, fieldErrors: {} };
  },
);

export type SimplePersonActionResult = { ok: boolean; error?: string };

// Baja (soft delete, paso 4.4 -- decisión 2 del reporte): nunca DELETE
// físico. No toca ocupaciones ni reclamos -- siguen existiendo con su
// person_id intacto (FK RESTRICT, nunca CASCADE), mismo criterio que la
// baja de una unidad (softDeleteUnitAction en units/actions.ts). El
// diálogo que llama a esto (DeletePersonDialog) ya mostró ocupaciones
// vigentes/reclamos pendientes ANTES de confirmar -- esta action no vuelve
// a chequear nada.
export const softDeletePersonAction = authorizedAction(
  async (context, personId: string): Promise<SimplePersonActionResult> => {
    const parsed = z.uuid().safeParse(personId);
    if (!parsed.success) {
      return { ok: false, error: "Vecino inválido." };
    }

    const [updated] = await db
      .update(people)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(people.id, parsed.data),
          eq(people.organizationId, context.organization.id),
          isNull(people.deletedAt),
        ),
      )
      .returning({ id: people.id });

    if (!updated) {
      return { ok: false, error: "No encontramos ese vecino." };
    }

    revalidatePersonPaths();
    return { ok: true };
  },
);

// Cierre de una ocupación (paso 4.4 -- decisión 3 del reporte, "cómo se
// distingue vigente de pasada"): setea `ended_on`, nunca borra la fila --
// es la forma en que un vecino que se mudó pasa de "vigente" a "historial"
// sin perder el registro de que vivió ahí. El CHECK de la base
// (ended_on_after_started_on, ver unit-occupancies.ts) exige una fecha
// ESTRICTAMENTE posterior al inicio -- se traduce acá para no mostrar el
// error crudo de Postgres si alguien elige una fecha igual o anterior.
export const closeOccupancyAction = authorizedAction(
  async (context, input: unknown): Promise<SimplePersonActionResult> => {
    const parsed = closeOccupancyFormSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Datos inválidos." };
    }

    const { occupancyId, endedOn } = parsed.data;

    try {
      const [updated] = await db
        .update(unitOccupancies)
        .set({ endedOn })
        .where(
          and(
            eq(unitOccupancies.id, occupancyId),
            eq(unitOccupancies.organizationId, context.organization.id),
            isNull(unitOccupancies.endedOn),
            isNull(unitOccupancies.deletedAt),
          ),
        )
        .returning({ id: unitOccupancies.id });

      if (!updated) {
        return {
          ok: false,
          error: "No encontramos esa ocupación, o ya estaba finalizada.",
        };
      }
    } catch (error) {
      const pgError = unwrapPostgresError(error);
      if (
        pgError?.code === CHECK_VIOLATION &&
        pgError.constraint_name === OCCUPANCY_ENDED_ON_CHECK
      ) {
        return {
          ok: false,
          error:
            "La fecha de fin tiene que ser posterior a la fecha de inicio de la ocupación.",
        };
      }
      return {
        ok: false,
        error:
          "No pudimos finalizar la ocupación. Probá de nuevo en un momento.",
      };
    }

    revalidatePersonPaths();
    return { ok: true };
  },
);

export type PersonPhoneCheckResult = { match: PersonPhoneMatch | null };

// Chequeo en vivo del teléfono (paso 4.4 -- decisión 1 del reporte),
// llamado con debounce desde PersonOccupancyForm mientras se escribe el
// teléfono. Mismo patrón que checkUnitAvailableAction/
// checkCodePrefixAvailableAction: feedback temprano, no la defensa real
// (esa es el índice único parcial de la base, traducido en
// translatePersonError() para el caso de carrera).
export const checkPersonByPhoneAction = authorizedAction(
  async (context, phoneE164: string): Promise<PersonPhoneCheckResult> => {
    const normalized = normalizePhoneInput(phoneE164.trim());
    if (!AR_WHATSAPP_E164_REGEX.test(normalized)) {
      return { match: null };
    }

    const match = await findPersonByPhone(context.organization.id, normalized);
    return { match };
  },
);

// Para el diálogo de baja (paso 4.4): trae ocupaciones vigentes y reclamos
// pendientes de UNA persona puntual, recién cuando se abre ese diálogo --
// nunca como parte del listado (mismo motivo que
// getUnitDependencyCountsAction en units/actions.ts: evitar el N+1).
export const getPersonDependencyCountsAction = authorizedAction(
  async (context, personId: string): Promise<PersonDependencyCounts> => {
    const parsed = z.uuid().safeParse(personId);
    if (!parsed.success) {
      return { activeOccupanciesCount: 0, pendingTicketsCount: 0 };
    }
    return getPersonDependencyCounts(context.organization.id, parsed.data);
  },
);
