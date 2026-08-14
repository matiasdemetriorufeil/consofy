import { z } from "zod";

import { unitType } from "@/db/schema/units";

// Compartido entre cliente (UnitForm/BulkUnitsForm, vía zodResolver) y
// servidor (actions.ts) -- mismo patrón que building-schema.ts. Ver
// CLAUDE.md > Reglas de seguridad: toda entrada se valida con Zod en el
// servidor aunque ya se haya validado en el cliente.

export const UNIT_TYPES = unitType.enumValues;
export type UnitTypeValue = (typeof UNIT_TYPES)[number];

// Alta/edición de UNA unidad (paso 4.3). `tower` nullable -- mismo criterio
// que la columna real (units.tower): la mayoría de los edificios no tienen
// torres. `floor`/`number` son texto libre a propósito, igual que la
// columna: "PB", "Subsuelo 1", "Local 3" son valores reales, no solo
// números -- ver el comentario de units.ts. No hay un campo "etiqueta"
// acá: es una decisión confirmada con el usuario -- lo que la UI llama
// "etiqueta" es el tag visual que ya arma UnitTag combinando floor+number
// (ej. "3°B"), no una columna nueva.
export const unitFormSchema = z.object({
  tower: z
    .string()
    .trim()
    .max(60, "Como máximo 60 caracteres.")
    .nullish()
    .transform((value) => (value ? value : null)),
  floor: z
    .string()
    .trim()
    .min(1, "Ingresá un piso.")
    .max(30, "Como máximo 30 caracteres."),
  number: z
    .string()
    .trim()
    .min(1, "Ingresá un número o letra de departamento.")
    .max(30, "Como máximo 30 caracteres."),
  type: z.enum(UNIT_TYPES, { message: "Elegí un tipo de unidad." }),
});

export type UnitFormInput = z.input<typeof unitFormSchema>;
export type UnitFormOutput = z.output<typeof unitFormSchema>;

// `buildingId` va DENTRO del esquema (no como argumento aparte de la
// Server Action) para validarlo en la misma pasada que el resto -- nunca
// es un dato que la persona escriba, viaja ya resuelto desde la URL
// (params de la pestaña Unidades), pero igual hay que validar que sea un
// uuid antes de usarlo: es el mismo criterio de "toda entrada se valida en
// el servidor" aplicado a un campo que no vino de un <input>.
export const createUnitFormSchema = unitFormSchema.extend({
  buildingId: z.uuid(),
});
export type CreateUnitFormInput = z.input<typeof createUnitFormSchema>;

export const updateUnitFormSchema = unitFormSchema.extend({
  id: z.uuid(),
  buildingId: z.uuid(),
});
export type UpdateUnitFormInput = z.input<typeof updateUnitFormSchema>;

export type UnitFieldErrors = Partial<Record<keyof UnitFormOutput, string>>;

export type UnitFormState = {
  ok: boolean;
  formError: string | null;
  fieldErrors: UnitFieldErrors;
};

export const initialUnitFormState: UnitFormState = {
  ok: false,
  formError: null,
  fieldErrors: {},
};

// -----------------------------------------------------------------------
// Creación masiva (paso 4.3, punto "creación masiva")
// -----------------------------------------------------------------------

// Techo duro al tamaño de una tanda -- no es un límite real de negocio (un
// edificio real rara vez supera esto), es una protección contra un typo
// ("piso 1 a 9999") que dispararía un INSERT de miles de filas sin
// querer. 300 es generoso -- más que cualquier edificio real del dominio
// de esta app (consorcios, no torres de cientos de pisos) -- y sigue
// siendo instantáneo para Postgres.
export const BULK_MAX_UNITS = 300;

const LETTER_REGEX = /^[A-Z]$/;
const LETTER_HELP = "Una sola letra, A a Z.";

export const bulkUnitsFormSchema = z
  .object({
    buildingId: z.uuid(),
    tower: z
      .string()
      .trim()
      .max(60, "Como máximo 60 caracteres.")
      .nullish()
      .transform((value) => (value ? value : null)),
    type: z.enum(UNIT_TYPES, { message: "Elegí un tipo de unidad." }),
    // z.number(), no z.coerce.number(): el input de un campo coercido
    // tipa como `unknown` en Zod 4 (acepta cualquier cosa coercible), lo
    // que hace que react-hook-form no pueda tipar bien defaultValues ni
    // register() para este campo. En cambio, el <input type="number"> del
    // formulario usa la opción `valueAsNumber` de RHF -- eso ya entrega un
    // number real antes de que Zod lo vea, así que acá alcanza con
    // validar que sea un number, sin coercionar nada.
    floorStart: z
      .number({ message: "Ingresá un piso inicial." })
      .int()
      .min(1, "El piso inicial tiene que ser 1 o más.")
      .max(999),
    floorEnd: z
      .number({ message: "Ingresá un piso final." })
      .int()
      .min(1, "El piso final tiene que ser 1 o más.")
      .max(999),
    // "letters" (A a D) o "numbers" (1 a 4) -- los dos casos del ejemplo
    // del enunciado ("departamentos A a D") más el equivalente numérico,
    // que ya aparece en el seed para cocheras/bauleras ("1", "2", "3").
    numberMode: z.enum(["letters", "numbers"]),
    letterStart: z
      .string()
      .trim()
      .toUpperCase()
      .regex(LETTER_REGEX, LETTER_HELP)
      .optional(),
    letterEnd: z
      .string()
      .trim()
      .toUpperCase()
      .regex(LETTER_REGEX, LETTER_HELP)
      .optional(),
    numberStart: z.number().int().min(1).max(999).optional(),
    numberEnd: z.number().int().min(1).max(999).optional(),
  })
  .refine((data) => data.floorStart <= data.floorEnd, {
    message: "El piso inicial no puede ser mayor al final.",
    path: ["floorEnd"],
  })
  .refine(
    (data) =>
      data.numberMode !== "letters" ||
      (!!data.letterStart &&
        !!data.letterEnd &&
        data.letterStart <= data.letterEnd),
    {
      message: "El rango de letras no es válido.",
      path: ["letterEnd"],
    },
  )
  .refine(
    (data) =>
      data.numberMode !== "numbers" ||
      (data.numberStart != null &&
        data.numberEnd != null &&
        data.numberStart <= data.numberEnd),
    {
      message: "El rango de números no es válido.",
      path: ["numberEnd"],
    },
  )
  .refine(
    (data) => {
      const floors = data.floorEnd - data.floorStart + 1;
      const departments =
        data.numberMode === "letters"
          ? (data.letterEnd?.charCodeAt(0) ?? 0) -
            (data.letterStart?.charCodeAt(0) ?? 0) +
            1
          : (data.numberEnd ?? 0) - (data.numberStart ?? 0) + 1;
      return floors * departments <= BULK_MAX_UNITS;
    },
    {
      message: `Como máximo se pueden generar ${BULK_MAX_UNITS} unidades de una vez -- probá en tandas más chicas.`,
      path: ["floorEnd"],
    },
  );

export type BulkUnitsFormInput = z.input<typeof bulkUnitsFormSchema>;
export type BulkUnitsFormOutput = z.output<typeof bulkUnitsFormSchema>;

export type BulkUnitCandidate = {
  tower: string | null;
  floor: string;
  number: string;
  type: UnitTypeValue;
};

// Arma la grilla completa (todos los pisos x todos los departamentos) a
// partir de un input ya validado -- pura, sin tocar la base, así la puede
// usar tanto la previsualización como la creación real con la misma
// lógica exacta (nunca puede desalinearse "lo que se mostró" de "lo que se
// crea").
export function generateBulkUnitCandidates(
  input: BulkUnitsFormOutput,
): BulkUnitCandidate[] {
  const floors: string[] = [];
  for (let floor = input.floorStart; floor <= input.floorEnd; floor++) {
    floors.push(String(floor));
  }

  const numbers: string[] = [];
  if (input.numberMode === "letters") {
    const start = input.letterStart!.charCodeAt(0);
    const end = input.letterEnd!.charCodeAt(0);
    for (let code = start; code <= end; code++) {
      numbers.push(String.fromCharCode(code));
    }
  } else {
    for (let n = input.numberStart!; n <= input.numberEnd!; n++) {
      numbers.push(String(n));
    }
  }

  const candidates: BulkUnitCandidate[] = [];
  for (const floor of floors) {
    for (const number of numbers) {
      candidates.push({ tower: input.tower, floor, number, type: input.type });
    }
  }
  return candidates;
}

// Valida el lote que vuelve del cliente en el paso de confirmación --
// nunca se confía en que sea el mismo array que generó
// generateBulkUnitCandidates() en el servidor durante la previsualización,
// aunque en el uso normal lo sea: es la misma regla de siempre (CLAUDE.md >
// Reglas de seguridad, "toda entrada se valida con Zod en el servidor")
// aplicada a un array en vez de a un objeto de formulario.
const bulkUnitCandidateSchema = z.object({
  tower: z.string().max(60).nullable(),
  floor: z.string().trim().min(1).max(30),
  number: z.string().trim().min(1).max(30),
  type: z.enum(UNIT_TYPES),
});

export const bulkUnitCandidatesSchema = z
  .array(bulkUnitCandidateSchema)
  .min(1, "No hay unidades para crear.")
  .max(BULK_MAX_UNITS);

// Vive acá y no en actions.ts: un archivo "use server" solo puede exportar
// funciones async -- mismo motivo que separa LoginState de actions.ts en
// el feature de auth, aplicado acá a la previsualización de la creación
// masiva. Encontrado en la práctica, no una precaución teórica: tenerlo
// como const en actions.ts rompía el build ("A 'use server' file can only
// export async functions, found object").
export type BulkPreviewState =
  | { status: "idle" }
  | {
      status: "error";
      formError: string | null;
      fieldErrors: Partial<Record<keyof BulkUnitsFormOutput, string>>;
    }
  | {
      status: "ready";
      buildingId: string;
      toCreate: BulkUnitCandidate[];
      alreadyExisting: BulkUnitCandidate[];
    };

export const initialBulkPreviewState: BulkPreviewState = { status: "idle" };
