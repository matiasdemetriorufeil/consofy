"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import Papa from "papaparse";
import { z } from "zod";

import { people, units, unitOccupancies } from "@/db/schema";
import {
  OCCUPANCY_ROLE_LABEL,
  type OccupancyRole,
} from "@/features/people/occupancy-role";
import {
  PERSON_UNIT_ONGOING_UNIQUE_CONSTRAINT,
  PHONE_FORMAT_CHECK,
  PHONE_UNIQUE_CONSTRAINT,
  PRIMARY_UNIQUE_CONSTRAINT,
} from "@/features/people/constraints";
import {
  findPeopleByPhones,
  findPersonByPhone,
  getBuildingOngoingOccupancies,
} from "@/features/people/queries";
import { UNIT_KEY_CONSTRAINT } from "@/features/units/constraints";
import {
  findUnitByKey,
  getUnitsForBuilding,
  unitKey,
} from "@/features/units/queries";
import { authorizedAction } from "@/lib/auth";
import {
  CHECK_VIOLATION,
  UNIQUE_VIOLATION,
  unwrapPostgresError,
} from "@/lib/postgres-errors";

import { importsDb } from "./db";
import {
  buildHeaderIndex,
  CSV_COLUMNS,
  IMPORT_MAX_ROWS,
  resolveCsvRow,
  type CsvColumnKey,
  type ImportBatchResult,
  type ImportPreviewState,
  type ImportRowError,
  type ImportRowPreview,
  type ResolvedCsvRow,
} from "./csv-schema";

// Invalida, después de escribir una tanda (entrega 2): las mismas rutas que
// createUnitAction/createPersonWithOccupancyAction -- la importación toca
// las tres cosas a la vez (unidades, personas, ocupaciones), así que
// revalida las dos pestañas.
function revalidateImportPaths() {
  revalidatePath("/panel/buildings/[buildingId]/units");
  revalidatePath("/panel/buildings/[buildingId]/people");
  revalidatePath("/panel/buildings");
}

// El BOM UTF-8 (EF BB BF) y el fallback a windows-1252 cubren el caso REAL
// de un CSV "guardado como" desde Excel en español (decisión del reporte):
// Excel para Windows, al exportar "CSV (delimitado por comas)" sin elegir
// explícitamente "CSV UTF-8", escribe los acentos en windows-1252
// (Latin-1), no en UTF-8 -- abrir ese archivo como UTF-8 a secas deja
// "Gómez" convertido en basura. El truco: decodificar como UTF-8 con
// `fatal: true` -- un archivo en windows-1252 con acentos casi siempre
// tiene bytes que NO son una secuencia UTF-8 válida, así que el decoder
// tira, y ahí se reintenta como windows-1252. Verificado con un archivo de
// prueba real (ver el reporte, entrega 1, punto 6).
function decodeCsvBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

function unitLabel(unit: ResolvedCsvRow["unit"]): string {
  return unit.tower
    ? `${unit.tower} - ${unit.floor}°${unit.number}`
    : `${unit.floor}°${unit.number}`;
}

function personLabel(person: NonNullable<ResolvedCsvRow["person"]>): string {
  return `${person.firstName} ${person.lastName ?? ""}`.trim();
}

// Resolución completa de UNA fila ya validada de forma aislada
// (resolveCsvRow), lista tanto para mostrarse (el campo `preview`, con la
// misma forma que espera ImportDialog) como para escribirse
// (unitKey/existingUnitId/person/occupancy, lo que necesita
// confirmImportBatchAction para no tener que volver a resolver nada).
type RowResolution =
  | { rowNumber: number; status: "error"; issues: string[] }
  | {
      rowNumber: number;
      status: "ready";
      unitKey: string;
      existingUnitId: string | null;
      unit: ResolvedCsvRow["unit"];
      person: {
        existingId: string | null;
        phoneE164: string | null;
        firstName: string;
        lastName: string | null;
        email: string | null;
        notes: string | null;
      } | null;
      occupancy: {
        role: OccupancyRole;
        isPrimary: boolean;
        startedOn: string;
      } | null;
      preview: Extract<ImportRowPreview, { status: "ready" }>;
    };

// Cruza un lote de filas YA VALIDADAS de forma aislada (resolveCsvRow)
// contra la base y entre sí -- lo mismo que hacía previewImportAction en la
// entrega 1, ahora factorizado para que confirmImportBatchAction lo use
// TAL CUAL, con consultas frescas, en el momento de escribir cada tanda.
// Esto es la revalidación entre previsualizar y confirmar que pide el
// enunciado: nunca se confía en la categorización que ya hizo el cliente
// (pudo pasar tiempo, pudo escribir alguien más mientras tanto) -- cada
// tanda vuelve a mirar la base tal como está AHORA, no como estaba cuando
// se previsualizó.
async function resolveRowsAgainstDatabase(
  organizationId: string,
  buildingId: string,
  resolved: ReturnType<typeof resolveCsvRow>[],
): Promise<RowResolution[]> {
  // Las 3 lecturas de precheck son independientes entre sí -- ninguna
  // necesita el resultado de otra -- así que las 3 van en el mismo
  // Promise.all (entrega 3: antes solo 2 de las 3 lo estaban). Ahorra la
  // latencia de ~1 round-trip de pared por tanda: barato y sin ningún
  // riesgo, a diferencia de paralelizar las ESCRITURAS (ver
  // confirmImportBatchAction).
  const phonesInBatch = [
    ...new Set(
      resolved
        .flatMap((r) => (r.status === "valid" ? [r.row.person?.phoneE164] : []))
        .filter((p): p is string => !!p),
    ),
  ];
  const [existingUnits, ongoingOccupancies, existingPeopleByPhone] =
    await Promise.all([
      getUnitsForBuilding(organizationId, buildingId),
      getBuildingOngoingOccupancies(organizationId, buildingId),
      findPeopleByPhones(organizationId, phonesInBatch),
    ]);
  const unitKeyToId = new Map(
    existingUnits.map((u) => [unitKey(u.tower, u.floor, u.number), u.id]),
  );
  const ongoingPairs = new Set(
    ongoingOccupancies.map((o) => `${o.unitId}::${o.personId}`),
  );
  const ongoingPrimaryUnitIds = new Set(
    ongoingOccupancies.filter((o) => o.isPrimary).map((o) => o.unitId),
  );

  const claimedUnitPersonPairs = new Set<string>();
  const claimedPrimaryUnits = new Map<string, number>();
  const filePhoneFirstSeenRow = new Map<string, number>();

  return resolved.map((result): RowResolution => {
    if (result.status === "invalid") {
      return {
        rowNumber: result.rowNumber,
        status: "error",
        issues: result.issues,
      };
    }

    const { rowNumber, row } = result;
    const key = unitKey(row.unit.tower, row.unit.floor, row.unit.number);
    const existingUnitId = unitKeyToId.get(key) ?? null;

    if (row.person === null || row.occupancy === null) {
      return {
        rowNumber,
        status: "ready",
        unitKey: key,
        existingUnitId,
        unit: row.unit,
        person: null,
        occupancy: null,
        preview: {
          rowNumber,
          status: "ready",
          unit: { label: unitLabel(row.unit), existing: !!existingUnitId },
          person: null,
          occupancy: null,
        },
      };
    }

    const phone = row.person.phoneE164;
    const dbMatch = phone ? existingPeopleByPhone.get(phone) : undefined;
    const seenInFileAt = phone ? filePhoneFirstSeenRow.get(phone) : undefined;
    const personExisting = !!dbMatch || seenInFileAt !== undefined;
    const personIdentityKey = phone ?? `__fila_${rowNumber}`;
    const pairKey = `${key}::${personIdentityKey}`;

    const issues: string[] = [];
    if (
      dbMatch &&
      existingUnitId &&
      ongoingPairs.has(`${existingUnitId}::${dbMatch.id}`)
    ) {
      issues.push(
        "Esta persona ya tiene una ocupación vigente en esta unidad.",
      );
    }
    if (claimedUnitPersonPairs.has(pairKey)) {
      issues.push(
        "Esta misma persona y unidad ya aparecen en otra fila de este archivo.",
      );
    }
    if (row.occupancy.isPrimary && claimedPrimaryUnits.has(key)) {
      issues.push(
        `Esta unidad ya tiene otra fila de este archivo marcada como principal (fila ${claimedPrimaryUnits.get(key)}).`,
      );
    }
    if (issues.length > 0) {
      return { rowNumber, status: "error", issues };
    }

    claimedUnitPersonPairs.add(pairKey);
    if (row.occupancy.isPrimary) {
      claimedPrimaryUnits.set(key, rowNumber);
    }
    if (phone && seenInFileAt === undefined) {
      filePhoneFirstSeenRow.set(phone, rowNumber);
    }

    const note =
      row.occupancy.isPrimary &&
      existingUnitId &&
      ongoingPrimaryUnitIds.has(existingUnitId)
        ? "Va a reemplazar al contacto principal actual de esta unidad."
        : null;

    const displayName = dbMatch
      ? `${dbMatch.firstName} ${dbMatch.lastName ?? ""}`.trim()
      : personLabel(row.person);

    return {
      rowNumber,
      status: "ready",
      unitKey: key,
      existingUnitId,
      unit: row.unit,
      person: {
        existingId: dbMatch?.id ?? null,
        phoneE164: phone,
        firstName: row.person.firstName,
        lastName: row.person.lastName,
        email: row.person.email,
        notes: row.person.notes,
      },
      occupancy: row.occupancy,
      preview: {
        rowNumber,
        status: "ready",
        unit: { label: unitLabel(row.unit), existing: !!existingUnitId },
        person: { label: displayName, existing: personExisting },
        occupancy: {
          roleLabel: OCCUPANCY_ROLE_LABEL[row.occupancy.role],
          isPrimary: row.occupancy.isPrimary,
          startedOn: row.occupancy.startedOn,
          note,
        },
      },
    };
  });
}

// Previsualización de la importación (entrega 1): parsea el archivo, valida
// CADA fila de forma aislada (resolveCsvRow) y las cruza contra la base y
// entre sí (resolveRowsAgainstDatabase) -- sin escribir nada. Devuelve
// además `parsedRows`, ya decodificado por el servidor, para que el
// cliente arme las tandas de confirmImportBatchAction sin volver a subir
// el archivo (entrega 2).
export const previewImportAction = authorizedAction(
  async (
    context,
    _prevState: ImportPreviewState,
    formData: FormData,
  ): Promise<ImportPreviewState> => {
    const buildingId = formData.get("buildingId");
    const file = formData.get("file");
    if (typeof buildingId !== "string" || !(file instanceof File)) {
      return { status: "file-error", message: "No se pudo leer el archivo." };
    }

    let text: string;
    try {
      text = decodeCsvBuffer(await file.arrayBuffer());
    } catch {
      return {
        status: "file-error",
        message:
          "No pudimos leer el archivo. Probá exportarlo de nuevo como CSV.",
      };
    }

    const parsed = Papa.parse<string[]>(text, {
      skipEmptyLines: true,
      delimiter: "",
    });

    const allRows = parsed.data;
    const headerRow = allRows[0];
    if (!headerRow) {
      return { status: "file-error", message: "El archivo está vacío." };
    }
    const dataRows = allRows.slice(1);

    const { index, missingRequired } = buildHeaderIndex(headerRow);
    if (missingRequired.length > 0) {
      return {
        status: "file-error",
        message: `Al archivo le faltan estas columnas: ${missingRequired.join(", ")}.`,
      };
    }

    if (dataRows.length === 0) {
      return {
        status: "file-error",
        message: "El archivo no tiene filas de datos, solo encabezado.",
      };
    }
    if (dataRows.length > IMPORT_MAX_ROWS) {
      return {
        status: "file-error",
        message: `El archivo tiene ${dataRows.length} filas. El máximo por importación es ${IMPORT_MAX_ROWS} -- dividilo en tandas más chicas.`,
      };
    }

    const parsedRows = dataRows.map((cells, i) => {
      // Sobre TODAS las columnas conocidas (CSV_COLUMNS), no solo las que
      // aparecen en `index` -- un archivo que solo carga unidades (sin
      // ninguna columna de persona en el encabezado, caso válido: ver
      // REQUIRED_COLUMNS) tiene que dejar esas claves en "", no ausentes,
      // porque resolveCsvRow() accede a `raw.firstName` etc. directo y
      // rompería con `undefined`.
      const raw = Object.fromEntries(
        CSV_COLUMNS.map(({ key }) => {
          const columnIndex = index[key];
          const value =
            columnIndex === undefined ? "" : (cells[columnIndex]?.trim() ?? "");
          return [key, value];
        }),
      ) as Record<CsvColumnKey, string>;
      // +2: la fila 1 es el encabezado, así que la primera fila de datos
      // (i = 0) es la fila 2 del archivo -- el número que el administrador
      // ve si abre el CSV en una planilla.
      return { rowNumber: i + 2, raw };
    });

    const resolved = parsedRows.map(({ rowNumber, raw }) =>
      resolveCsvRow(raw, rowNumber),
    );
    const resolutions = await resolveRowsAgainstDatabase(
      context.organization.id,
      buildingId,
      resolved,
    );

    const rows: ImportRowPreview[] = resolutions.map((r) =>
      r.status === "error"
        ? { rowNumber: r.rowNumber, status: "error", issues: r.issues }
        : r.preview,
    );

    const newUnitKeys = new Set<string>();
    const existingUnitKeysUsed = new Set<string>();
    const newPersonKeys = new Set<string>();
    const existingPersonKeysUsed = new Set<string>();
    let occupanciesToCreate = 0;
    for (const r of resolutions) {
      if (r.status === "error") continue;
      (r.existingUnitId ? existingUnitKeysUsed : newUnitKeys).add(r.unitKey);
      if (r.person && r.occupancy) {
        const key = r.person.phoneE164 ?? `__fila_${r.rowNumber}`;
        // `r.preview.person.existing` ya combina los dos casos de "no es
        // nueva": matchea contra la base, o matchea contra una fila
        // anterior de este mismo archivo (ver resolveRowsAgainstDatabase).
        (r.preview.person?.existing
          ? existingPersonKeysUsed
          : newPersonKeys
        ).add(key);
        occupanciesToCreate += 1;
      }
    }

    return {
      status: "ready",
      summary: {
        totalRows: rows.length,
        errorRows: rows.filter((r) => r.status === "error").length,
        unitsToCreate: newUnitKeys.size,
        unitsExisting: existingUnitKeysUsed.size,
        peopleToCreate: newPersonKeys.size,
        peopleExisting: existingPersonKeysUsed.size,
        occupanciesToCreate,
      },
      rows,
      parsedRows,
    };
  },
);

// Traduce el error de Postgres cuando la escritura de UNA fila choca contra
// alguno de los constraints que ya conocemos (mismos nombres que
// people/actions.ts y units/actions.ts, importados de los módulos
// compartidos -- ver CLAUDE.md > Acceso a datos). A diferencia de esas dos
// acciones, acá el resultado es un string corto para la fila, no un
// PersonFormState/UnitFormState -- esta función no escribe en el listado
// de un formulario, escribe en la lista de errores de la tanda.
function translateImportRowError(rawError: unknown): string {
  const error = unwrapPostgresError(rawError);
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      if (error.constraint_name === PHONE_UNIQUE_CONSTRAINT) {
        return "Ya hay un vecino con ese teléfono en esta organización.";
      }
      if (error.constraint_name === PRIMARY_UNIQUE_CONSTRAINT) {
        return "Ya se asignó otro contacto principal para esta unidad.";
      }
      if (error.constraint_name === PERSON_UNIT_ONGOING_UNIQUE_CONSTRAINT) {
        return "Esta persona ya tiene una ocupación vigente en esta unidad.";
      }
      if (error.constraint_name === UNIT_KEY_CONSTRAINT) {
        return "Ya existe una unidad con esa torre, piso y número.";
      }
    }
    if (
      error.code === CHECK_VIOLATION &&
      error.constraint_name === PHONE_FORMAT_CHECK
    ) {
      return "El teléfono no tiene un formato válido.";
    }
  }
  return "No pudimos guardar esta fila. Probá de nuevo en un momento.";
}

const confirmBatchInputSchema = z.object({
  buildingId: z.uuid(),
  rows: z
    .array(
      z.object({
        rowNumber: z.number().int().positive(),
        raw: z.record(z.string(), z.string()),
      }),
    )
    .min(1)
    .max(IMPORT_MAX_ROWS),
});

type ReadyResolution = Extract<RowResolution, { status: "ready" }>;

// Fase 1 de la escritura en paralelo (entrega 3): crea, EN PARALELO, cada
// unidad nueva DISTINTA que hace falta para esta tanda -- una sola vez por
// clave, aunque varias filas la compartan (dos ocupantes del mismo
// departamento nuevo), igual que antes hacía `createdUnitIds` en el loop
// secuencial. Se usa `importsDb` (pool dedicado, ver ./db.ts), nunca el
// cliente global.
//
// Self-healing ante una carrera real (alguien más creó exactamente esa
// unidad entre el precheck de resolveRowsAgainstDatabase y este INSERT):
// en vez de fallar la fila, se busca el id real con findUnitByKey() y se
// sigue -- la unidad "ya existe" ahora, ni más ni menos que si hubiera
// existido desde el principio. Solo si ni el INSERT ni esa búsqueda
// resuelven la clave, queda marcada como fallida -- ahí SÍ fallan (con un
// mensaje traducido) todas las filas que dependían de ella, en la fase 2.
async function createMissingUnits(
  organizationId: string,
  buildingId: string,
  keysToShapes: Map<string, ResolvedCsvRow["unit"]>,
): Promise<{
  idByKey: Map<string, string>;
  createdKeys: Set<string>;
  failedKeys: Map<string, string>;
}> {
  const idByKey = new Map<string, string>();
  const createdKeys = new Set<string>();
  const failedKeys = new Map<string, string>();

  await Promise.all(
    [...keysToShapes.entries()].map(async ([key, shape]) => {
      try {
        const [inserted] = await importsDb
          .insert(units)
          .values({
            organizationId,
            buildingId,
            tower: shape.tower,
            floor: shape.floor,
            number: shape.number,
            type: shape.type,
          })
          .returning({ id: units.id });
        if (!inserted) {
          throw new Error("No pudimos crear la unidad.");
        }
        idByKey.set(key, inserted.id);
        createdKeys.add(key);
      } catch (error) {
        const pgError = unwrapPostgresError(error);
        if (pgError?.constraint_name === UNIT_KEY_CONSTRAINT) {
          const existing = await findUnitByKey(
            organizationId,
            buildingId,
            shape.tower,
            shape.floor,
            shape.number,
          );
          if (existing) {
            idByKey.set(key, existing.id);
            return;
          }
        }
        failedKeys.set(key, translateImportRowError(error));
      }
    }),
  );

  return { idByKey, createdKeys, failedKeys };
}

// Misma idea que createMissingUnits(), para personas. Las claves sin
// teléfono (`__fila_N`) nunca pueden chocar (no hay dos filas con la misma
// clave sintética), así que para esas el único error posible es uno
// genuinamente inesperado, no una carrera.
async function createMissingPeople(
  organizationId: string,
  keysToShapes: Map<
    string,
    {
      phoneE164: string | null;
      firstName: string;
      lastName: string | null;
      email: string | null;
      notes: string | null;
    }
  >,
): Promise<{
  idByKey: Map<string, string>;
  createdKeys: Set<string>;
  failedKeys: Map<string, string>;
}> {
  const idByKey = new Map<string, string>();
  const createdKeys = new Set<string>();
  const failedKeys = new Map<string, string>();

  await Promise.all(
    [...keysToShapes.entries()].map(async ([key, shape]) => {
      try {
        const [inserted] = await importsDb
          .insert(people)
          .values({
            organizationId,
            firstName: shape.firstName,
            lastName: shape.lastName,
            phoneE164: shape.phoneE164,
            email: shape.email,
            notes: shape.notes,
          })
          .returning({ id: people.id });
        if (!inserted) {
          throw new Error("No pudimos crear el vecino.");
        }
        idByKey.set(key, inserted.id);
        createdKeys.add(key);
      } catch (error) {
        const pgError = unwrapPostgresError(error);
        if (
          pgError?.constraint_name === PHONE_UNIQUE_CONSTRAINT &&
          shape.phoneE164
        ) {
          const existing = await findPersonByPhone(
            organizationId,
            shape.phoneE164,
          );
          if (existing) {
            idByKey.set(key, existing.id);
            return;
          }
        }
        failedKeys.set(key, translateImportRowError(error));
      }
    }),
  );

  return { idByKey, createdKeys, failedKeys };
}

// Fase 2: con TODAS las unidades/personas ya resueltas (fase 1), cada fila
// escribe su propia ocupación EN PARALELO -- resolveRowsAgainstDatabase ya
// garantizó que ninguna fila "lista" comparte (unidad, persona) con otra
// de esta tanda (eso es un error de previsualización, no llega hasta acá),
// así que estas escrituras son independientes entre sí de verdad, no solo
// en apariencia. Cada fila sigue siendo su propia transacción (`importsDb
// .transaction()`, una conexión propia del pool) con su propio mensaje de
// error traducido -- no se negoció nada de esa garantía, solo se dejó de
// esperar a que termine una fila para que arranque la siguiente.
async function writeRowOccupancy(
  context: { organization: { id: string } },
  buildingId: string,
  resolution: ReadyResolution,
  unitIdByKey: Map<string, string>,
  personIdByKey: Map<string, string>,
): Promise<
  | { ok: true; unitId: string; personId: string | null }
  | { ok: false; rowNumber: number; message: string }
> {
  const unitId = unitIdByKey.get(resolution.unitKey);
  if (!unitId) {
    return {
      ok: false,
      rowNumber: resolution.rowNumber,
      message: "No pudimos crear o encontrar la unidad de esta fila.",
    };
  }

  if (!resolution.person || !resolution.occupancy) {
    return { ok: true, unitId, personId: null };
  }

  const personKey =
    resolution.person.phoneE164 ?? `__fila_${resolution.rowNumber}`;
  const personId = personIdByKey.get(personKey);
  if (!personId) {
    return {
      ok: false,
      rowNumber: resolution.rowNumber,
      message: "No pudimos crear o encontrar el vecino de esta fila.",
    };
  }

  try {
    await importsDb.transaction(async (tx) => {
      // Mismo desmarcado atómico que createPersonWithOccupancyAction (paso
      // 4.4) para el contacto principal -- ver ese archivo. Seguro en
      // paralelo: resolveRowsAgainstDatabase ya rechazó (como error de
      // fila) que dos filas de esta tanda marquen principal para la MISMA
      // unidad, así que ninguna otra fila concurrente toca este mismo
      // `unit_id` acá.
      if (resolution.occupancy!.isPrimary) {
        await tx
          .update(unitOccupancies)
          .set({ isPrimary: false })
          .where(
            and(
              eq(unitOccupancies.unitId, unitId),
              eq(unitOccupancies.organizationId, context.organization.id),
              eq(unitOccupancies.isPrimary, true),
              isNull(unitOccupancies.endedOn),
              isNull(unitOccupancies.deletedAt),
            ),
          );
      }

      await tx.insert(unitOccupancies).values({
        organizationId: context.organization.id,
        unitId,
        personId,
        role: resolution.occupancy!.role,
        isPrimary: resolution.occupancy!.isPrimary,
        startedOn: resolution.occupancy!.startedOn,
      });
    });
  } catch (error) {
    return {
      ok: false,
      rowNumber: resolution.rowNumber,
      message: translateImportRowError(error),
    };
  }

  return { ok: true, unitId, personId };
}

// Escribe UNA tanda de la importación. El cliente maneja el loop de tandas
// -- ver ImportDialog -- así que esta action procesa solo las filas que le
// llegan, nunca el archivo entero. Revalida cada fila desde cero contra la
// base (resolveRowsAgainstDatabase) antes de escribir -- nunca confía en
// que la fila siga siendo válida solo porque lo era en la previsualización.
//
// Entrega 3 (medido, no estimado -- ver el reporte): la tanda ya NO es una
// sola transacción con SAVEPOINTs anidados por fila. Un SAVEPOINT vive
// sobre UNA conexión/sesión, así que paralelizar filas de verdad exige que
// cada una tenga su PROPIA conexión -- por eso el pool dedicado
// (`importsDb`, ./db.ts) y por eso cada fila es ahora su propia
// transacción de nivel superior, no una anidada. La atomicidad POR FILA es
// la misma garantía de siempre (todo o nada, con su propio mensaje de
// error); lo que cambia es que ya no hay una transacción "de tanda" que
// las contenga a todas -- nunca la hubo como garantía funcional real (cada
// fila ya podía fallar sola), así que no se pierde nada ahí.
export const confirmImportBatchAction = authorizedAction(
  async (context, input: unknown): Promise<ImportBatchResult> => {
    const parsed = confirmBatchInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        processedRows: 0,
        unitsCreated: 0,
        unitsReused: 0,
        peopleCreated: 0,
        peopleReused: 0,
        occupanciesCreated: 0,
        errors: [{ rowNumber: 0, message: "Datos de la tanda inválidos." }],
      };
    }

    const { buildingId, rows: batchRows } = parsed.data;
    const resolved = batchRows.map(({ rowNumber, raw }) =>
      resolveCsvRow(raw as Record<CsvColumnKey, string>, rowNumber),
    );
    const resolutions = await resolveRowsAgainstDatabase(
      context.organization.id,
      buildingId,
      resolved,
    );

    const errors: ImportRowError[] = [];
    for (const r of resolutions) {
      if (r.status === "error") {
        errors.push({ rowNumber: r.rowNumber, message: r.issues.join(" ") });
      }
    }
    const readyResolutions = resolutions.filter(
      (r): r is ReadyResolution => r.status === "ready",
    );

    // Claves DISTINTAS que hacen falta crear -- "primera fila que la
    // menciona gana la forma" (misma regla que antes, ver el comentario
    // histórico más abajo en el reporte): si dos filas describen la MISMA
    // unidad con datos apenas distintos (no debería pasar, pero el CSV es
    // texto libre), se usa la de la fila que aparece primero.
    const unitIdByKey = new Map<string, string>();
    const unitShapesToCreate = new Map<string, ResolvedCsvRow["unit"]>();
    const personIdByKey = new Map<string, string>();
    const personShapesToCreate = new Map<
      string,
      NonNullable<ReadyResolution["person"]>
    >();

    for (const r of readyResolutions) {
      if (r.existingUnitId) {
        unitIdByKey.set(r.unitKey, r.existingUnitId);
      } else if (!unitShapesToCreate.has(r.unitKey)) {
        unitShapesToCreate.set(r.unitKey, r.unit);
      }
      if (r.person) {
        const personKey = r.person.phoneE164 ?? `__fila_${r.rowNumber}`;
        if (r.person.existingId) {
          personIdByKey.set(personKey, r.person.existingId);
        } else if (!personShapesToCreate.has(personKey)) {
          personShapesToCreate.set(personKey, r.person);
        }
      }
    }

    const [unitsResult, peopleResult] = await Promise.all([
      createMissingUnits(
        context.organization.id,
        buildingId,
        unitShapesToCreate,
      ),
      createMissingPeople(context.organization.id, personShapesToCreate),
    ]);
    for (const [key, id] of unitsResult.idByKey) unitIdByKey.set(key, id);
    for (const [key, id] of peopleResult.idByKey) personIdByKey.set(key, id);

    // Si la unidad O la persona que necesitaba esta fila no se pudo
    // resolver (ni crear ni encontrar por la carrera), la fila entera
    // falla acá -- con el mensaje traducido específico de qué chocó, no
    // uno genérico -- y ni siquiera llega a intentar la ocupación.
    const rowsToWrite: ReadyResolution[] = [];
    for (const r of readyResolutions) {
      const unitFailure = unitsResult.failedKeys.get(r.unitKey);
      if (unitFailure) {
        errors.push({ rowNumber: r.rowNumber, message: unitFailure });
        continue;
      }
      if (r.person) {
        const personKey = r.person.phoneE164 ?? `__fila_${r.rowNumber}`;
        const personFailure = peopleResult.failedKeys.get(personKey);
        if (personFailure) {
          errors.push({ rowNumber: r.rowNumber, message: personFailure });
          continue;
        }
      }
      rowsToWrite.push(r);
    }

    const writeResults = await Promise.all(
      rowsToWrite.map((r) =>
        writeRowOccupancy(context, buildingId, r, unitIdByKey, personIdByKey),
      ),
    );

    // Unidades/personas: se cuentan por clave DISTINTA resuelta (creada o
    // reusada) en esta tanda, sin importar si la ocupación de ESA fila en
    // particular después falló o no -- la unidad/persona quedó igual de
    // creada/reusada en la base. Contarlas solo cuando la fila entera tiene
    // éxito las subcontaría: dos filas nuevas para la misma unidad nueva,
    // con la segunda fallando en su propia ocupación (ej. una carrera),
    // igual dejan la unidad creada una vez -- eso tiene que reflejarse.
    let unitsCreated = 0;
    let unitsReused = 0;
    for (const key of new Set(readyResolutions.map((r) => r.unitKey))) {
      if (unitsResult.failedKeys.has(key)) continue;
      if (unitsResult.createdKeys.has(key)) {
        unitsCreated += 1;
      } else {
        unitsReused += 1;
      }
    }

    let peopleCreated = 0;
    let peopleReused = 0;
    const personKeysInBatch = new Set(
      readyResolutions
        .filter((r) => r.person)
        .map((r) => r.person!.phoneE164 ?? `__fila_${r.rowNumber}`),
    );
    for (const key of personKeysInBatch) {
      if (peopleResult.failedKeys.has(key)) continue;
      if (peopleResult.createdKeys.has(key)) {
        peopleCreated += 1;
      } else {
        peopleReused += 1;
      }
    }

    let occupanciesCreated = 0;
    for (let i = 0; i < rowsToWrite.length; i++) {
      const result = writeResults[i]!;
      if (!result.ok) {
        errors.push({ rowNumber: result.rowNumber, message: result.message });
        continue;
      }
      if (rowsToWrite[i]!.person) {
        occupanciesCreated += 1;
      }
    }

    if (unitsCreated > 0 || peopleCreated > 0 || occupanciesCreated > 0) {
      revalidateImportPaths();
    }

    return {
      processedRows: resolutions.length,
      unitsCreated,
      unitsReused,
      peopleCreated,
      peopleReused,
      occupanciesCreated,
      errors,
    };
  },
);
