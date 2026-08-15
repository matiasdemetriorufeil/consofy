"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { units } from "@/db/schema";
import { authorizedAction } from "@/lib/auth";
import { UNIQUE_VIOLATION, unwrapPostgresError } from "@/lib/postgres-errors";

import { UNIT_KEY_CONSTRAINT } from "./constraints";
import {
  bulkUnitCandidatesSchema,
  bulkUnitsFormSchema,
  createUnitFormSchema,
  generateBulkUnitCandidates,
  updateUnitFormSchema,
  type BulkPreviewState,
  type BulkUnitCandidate,
  type BulkUnitsFormOutput,
  type UnitFieldErrors,
  type UnitFormState,
} from "./unit-schema";
import {
  findUnitByKey,
  getExistingUnitKeys,
  getUnitDependencyCounts,
  unitKey,
  type UnitDependencyCounts,
} from "./queries";

// Invalida, después de cada mutación de unidades (paso 4.3):
// - la pestaña Unidades del edificio (el patrón LITERAL con corchetes
//   revalida para CUALQUIER buildingId, mismo criterio que
//   revalidateBuildingPaths() en buildings/actions.ts).
// - "/panel/buildings": el listado de edificios muestra `unitsCount` por
//   fila (getManagedBuildings(), paso 4.1) -- sin esto, crear/borrar
//   unidades dejaría ese número desactualizado hasta un reload.
function revalidateUnitPaths() {
  revalidatePath("/panel/buildings/[buildingId]/units");
  revalidatePath("/panel/buildings");
}

function zodIssuesToFieldErrors(error: z.ZodError): UnitFieldErrors {
  const fieldErrors: UnitFieldErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !(field in fieldErrors)) {
      fieldErrors[field as keyof UnitFieldErrors] = issue.message;
    }
  }
  return fieldErrors;
}

// Traduce el error de Postgres cuando el índice único parcial
// (units_building_tower_floor_number_unique, ver units.ts) rechaza un
// INSERT/UPDATE -- nunca se devuelve el error crudo de la base (mismo
// criterio que translateBuildingError() en buildings/actions.ts, paso
// 4.1). A diferencia del prefijo de edificio, acá no hace falta buscar
// "quién ya lo usa": el valor que chocó es el mismo que se acaba de
// enviar, así que el mensaje se arma directo con esos datos, sin una
// consulta extra. `unwrapPostgresError()`/`UNIQUE_VIOLATION` y
// `UNIT_KEY_CONSTRAINT` viven en módulos compartidos (lib/postgres-errors.ts,
// ./constraints.ts) desde que apareció un segundo consumidor del mismo
// constraint: la escritura de la importación CSV (paso 4.5), que corre
// DENTRO de una transacción y necesita el desenvuelto de `.cause` -- ver el
// comentario largo en lib/postgres-errors.ts.
function translateUnitError(
  rawError: unknown,
  tower: string | null,
  floor: string,
  number: string,
): UnitFormState {
  const error = unwrapPostgresError(rawError);
  if (
    error &&
    error.code === UNIQUE_VIOLATION &&
    error.constraint_name === UNIT_KEY_CONSTRAINT
  ) {
    const label = tower
      ? `${tower} - ${floor}°${number}`
      : `${floor}°${number}`;
    return {
      ok: false,
      formError: null,
      fieldErrors: {
        number: `Ya existe la unidad "${label}" en este edificio.`,
      },
    };
  }

  return {
    ok: false,
    formError: "No pudimos guardar la unidad. Probá de nuevo en un momento.",
    fieldErrors: {},
  };
}

export const createUnitAction = authorizedAction(
  async (
    context,
    _prevState: UnitFormState,
    input: unknown,
  ): Promise<UnitFormState> => {
    const parsed = createUnitFormSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        formError: null,
        fieldErrors: zodIssuesToFieldErrors(parsed.error),
      };
    }

    const { buildingId, ...values } = parsed.data;
    try {
      // La FK compuesta (building_id, organization_id) -> buildings(id,
      // organization_id) (ver CLAUDE.md > Integridad entre organizaciones)
      // es la defensa real contra un buildingId de otra organización --
      // rechaza el INSERT a nivel base si building_id no pertenece a
      // context.organization.id, sin que este código tenga que verificarlo
      // aparte.
      await db.insert(units).values({
        organizationId: context.organization.id,
        buildingId,
        ...values,
      });
    } catch (error) {
      return translateUnitError(
        error,
        values.tower,
        values.floor,
        values.number,
      );
    }

    revalidateUnitPaths();
    return { ok: true, formError: null, fieldErrors: {} };
  },
);

export const updateUnitAction = authorizedAction(
  async (
    context,
    _prevState: UnitFormState,
    input: unknown,
  ): Promise<UnitFormState> => {
    const parsed = updateUnitFormSchema.safeParse(input);
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
        .update(units)
        .set(values)
        .where(
          and(
            eq(units.id, id),
            eq(units.buildingId, buildingId),
            eq(units.organizationId, context.organization.id),
            isNull(units.deletedAt),
          ),
        )
        .returning({ id: units.id });
    } catch (error) {
      return translateUnitError(
        error,
        values.tower,
        values.floor,
        values.number,
      );
    }

    if (!updated) {
      return {
        ok: false,
        formError:
          "No encontramos esa unidad. Puede que ya la hayan dado de baja.",
        fieldErrors: {},
      };
    }

    revalidateUnitPaths();
    return { ok: true, formError: null, fieldErrors: {} };
  },
);

export type SimpleUnitActionResult = { ok: boolean; error?: string };

// Baja (soft delete, paso 4.3): nunca DELETE físico. No toca ocupaciones ni
// reclamos -- siguen apuntando a esta unidad con su unit_id intacto (FK
// RESTRICT, nunca CASCADE), igual que la baja de un edificio no toca sus
// unidades (ver softDeleteBuildingAction en buildings/actions.ts). El
// diálogo que llama a esto (DeleteUnitDialog) ya mostró ocupantes/reclamos
// vigentes ANTES de confirmar -- esta action no vuelve a chequear nada,
// solo ejecuta lo que el diálogo ya advirtió.
//
// `buildingId` en el WHERE además de `id` y `organizationId`: defensa en
// profundidad -- no cambia qué filas puede tocar alguien de otra
// organización (organization_id ya alcanza para eso), pero evita que un
// estado de cliente desactualizado (la unidad de otro edificio) borre algo
// donde no corresponde.
export const softDeleteUnitAction = authorizedAction(
  async (
    context,
    buildingId: string,
    unitId: string,
  ): Promise<SimpleUnitActionResult> => {
    const parsedBuildingId = z.uuid().safeParse(buildingId);
    const parsedUnitId = z.uuid().safeParse(unitId);
    if (!parsedBuildingId.success || !parsedUnitId.success) {
      return { ok: false, error: "Unidad inválida." };
    }

    const [updated] = await db
      .update(units)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(units.id, parsedUnitId.data),
          eq(units.buildingId, parsedBuildingId.data),
          eq(units.organizationId, context.organization.id),
          isNull(units.deletedAt),
        ),
      )
      .returning({ id: units.id });

    if (!updated) {
      return { ok: false, error: "No encontramos esa unidad." };
    }

    revalidateUnitPaths();
    return { ok: true };
  },
);

export type UnitAvailability = { available: boolean };

// Validación en vivo (paso 4.3), mismo patrón que
// checkCodePrefixAvailableAction en buildings/actions.ts: feedback
// temprano en el formulario simple de alta/edición, no la defensa real
// (esa es el índice único parcial de la base, traducido en
// translateUnitError() para el caso de carrera).
export const checkUnitAvailableAction = authorizedAction(
  async (
    context,
    buildingId: string,
    tower: string | null,
    floor: string,
    number: string,
    excludeUnitId?: string,
  ): Promise<UnitAvailability> => {
    const parsedBuildingId = z.uuid().safeParse(buildingId);
    if (!parsedBuildingId.success || !floor.trim() || !number.trim()) {
      return { available: true };
    }

    const conflict = await findUnitByKey(
      context.organization.id,
      parsedBuildingId.data,
      tower,
      floor,
      number,
      excludeUnitId,
    );

    return { available: !conflict };
  },
);

// Para el diálogo de baja (paso 4.3): trae ocupantes vigentes y reclamos
// pendientes de UNA unidad puntual, recién cuando se abre ese diálogo --
// nunca como parte del listado (ver el comentario de
// getUnitDependencyCounts() en queries.ts sobre por qué eso sería un N+1).
export const getUnitDependencyCountsAction = authorizedAction(
  async (context, unitId: string): Promise<UnitDependencyCounts> => {
    const parsed = z.uuid().safeParse(unitId);
    if (!parsed.success) {
      return { activeOccupantsCount: 0, pendingTicketsCount: 0 };
    }
    return getUnitDependencyCounts(context.organization.id, parsed.data);
  },
);

// -----------------------------------------------------------------------
// Creación masiva (paso 4.3)
// -----------------------------------------------------------------------

// Arma la previsualización (paso 4.3, "con previsualización... antes de
// confirmar"): calcula la grilla completa a partir del rango pedido
// (generateBulkUnitCandidates) y la separa en dos listas contra lo que YA
// existe en este edificio -- getExistingUnitKeys() trae TODAS las unidades
// del edificio en una sola consulta (no una por candidata: con hasta 300
// candidatas de un lado, sería un N+1 real). No escribe nada todavía.
export const previewBulkUnitsAction = authorizedAction(
  async (
    context,
    _prevState: BulkPreviewState,
    input: unknown,
  ): Promise<BulkPreviewState> => {
    const parsed = bulkUnitsFormSchema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof BulkUnitsFormOutput, string>> =
        {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string" && !(field in fieldErrors)) {
          fieldErrors[field as keyof BulkUnitsFormOutput] = issue.message;
        }
      }
      return { status: "error", formError: null, fieldErrors };
    }

    const candidates = generateBulkUnitCandidates(parsed.data);
    const existingKeys = await getExistingUnitKeys(
      context.organization.id,
      parsed.data.buildingId,
    );

    const toCreate: BulkUnitCandidate[] = [];
    const alreadyExisting: BulkUnitCandidate[] = [];
    for (const candidate of candidates) {
      const bucket = existingKeys.has(
        unitKey(candidate.tower, candidate.floor, candidate.number),
      )
        ? alreadyExisting
        : toCreate;
      bucket.push(candidate);
    }

    return {
      status: "ready",
      buildingId: parsed.data.buildingId,
      toCreate,
      alreadyExisting,
    };
  },
);

export type BulkCreateResult =
  | { ok: true; createdCount: number; skippedCount: number }
  | { ok: false; error: string };

// Crea de verdad el lote confirmado en la previsualización. No repite el
// filtro en JS que ya hizo previewBulkUnitsAction (Como puede haber pasado
// tiempo entre previsualizar y confirmar, ese filtro podría estar
// desactualizado) -- en cambio, se apoya en el propio índice único parcial
// de la base como fuente de verdad: `onConflictDoNothing()` hace que
// Postgres descarte en silencio cualquier fila que choque, sin que el
// INSERT entero falle por una sola coincidencia. `returning()` sobre lo
// que realmente se insertó es el número real, no una suposición de lo que
// "debería" haber entrado.
export const createUnitsBulkAction = authorizedAction(
  async (
    context,
    buildingId: string,
    candidatesInput: unknown,
  ): Promise<BulkCreateResult> => {
    const parsedBuildingId = z.uuid().safeParse(buildingId);
    if (!parsedBuildingId.success) {
      return { ok: false, error: "Edificio inválido." };
    }

    const parsedCandidates =
      bulkUnitCandidatesSchema.safeParse(candidatesInput);
    if (!parsedCandidates.success) {
      return { ok: false, error: "No hay unidades válidas para crear." };
    }

    try {
      const inserted = await db
        .insert(units)
        .values(
          parsedCandidates.data.map((candidate) => ({
            organizationId: context.organization.id,
            buildingId: parsedBuildingId.data,
            tower: candidate.tower,
            floor: candidate.floor,
            number: candidate.number,
            type: candidate.type,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: units.id });

      revalidateUnitPaths();
      return {
        ok: true,
        createdCount: inserted.length,
        skippedCount: parsedCandidates.data.length - inserted.length,
      };
    } catch {
      return {
        ok: false,
        error: "No pudimos crear las unidades. Probá de nuevo en un momento.",
      };
    }
  },
);
