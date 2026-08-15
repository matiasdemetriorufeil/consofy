import { UNIT_TYPE_LABEL } from "@/features/buildings/unit-type";
import { OCCUPANCY_ROLE_LABEL } from "@/features/people/occupancy-role";
import {
  occupancyFieldsSchema,
  OCCUPANCY_ROLES,
  personFieldsSchema,
  type OccupancyFieldsOutput,
  type PersonFieldsOutput,
} from "@/features/people/person-schema";
import {
  UNIT_TYPES,
  unitFormSchema,
  type UnitFormOutput,
} from "@/features/units/unit-schema";
import { stripDiacritics } from "@/lib/text";

// Importación de unidades y personas desde CSV (paso 4.5). Reutiliza los
// esquemas de alta ya existentes (unitFormSchema del paso 4.3,
// personFieldsSchema/occupancyFieldsSchema del paso 4.4) en vez de
// reimplementar sus reglas -- los mismos mensajes de error ("Ingresá un
// piso.", el formato de teléfono, etc.) valen acá, así que reusarlos evita
// que las dos validaciones se desalineen con el tiempo.

// Techo duro por archivo -- mismo espíritu que BULK_MAX_UNITS (paso 4.3),
// pero un número propio: acá cada fila puede escribir hasta 3 filas de base
// (unidad + persona + ocupación) contra 1 sola en la creación masiva de
// unidades, y cada fila necesita ADEMÁS resolverse contra la base antes de
// escribir (buscar si la unidad/persona ya existen) -- más caro por fila.
// 500 es el tamaño que vos mismo usaste como caso de estrés en el
// enunciado: un edificio real de esta app (consorcios, no torres de
// cientos de unidades) no debería necesitar más que eso en una sola tanda;
// alguien con más filas puede dividir el archivo en tandas de hasta 500.
export const IMPORT_MAX_ROWS = 500;

// Tamaño de tanda para la escritura real: cada tanda es su propia llamada
// a confirmImportBatchAction, medida en el reporte contra la base real. El
// cliente maneja el loop de tandas (no el servidor un archivo entero de
// una sola invocación) justamente para no depender de que el servidor
// autorregule su propio tiempo de ejecución: cada tanda es una request
// corta e independiente, así que una caída de conexión o un cierre de
// pestaña a mitad de camino deja commiteadas las tandas que ya terminaron,
// ni una más ni una menos.
//
// Recalculado tras paralelizar la escritura por fila (ver
// confirmImportBatchAction, IMPORT_WRITE_POOL_MAX en ./db.ts): medí el
// caso PEOR -- un archivo donde CADA fila crea una unidad y una persona
// nuevas, sin ningún reuso, el más caro posible -- con tandas de una sola
// invocación de distintos tamaños:
//   20 filas -> 7.1s   25 filas -> 8.7s   28 filas -> 8.7s
//   30 filas -> 6.6s*  35 filas -> 10.2s  40 filas -> 9.2s*  50 filas -> 12.3s
//   (* estas dos tuvieron reuso parcial por superposición de datos de
//   prueba entre corridas, no son 100% "todo nuevo" como las demás)
// 25 filas por tanda deja margen real (8.7s de 10s, ~13%) incluso en el
// caso más caro -- 35 ya lo pasaba. Con 500 filas eso da 20 tandas; el
// tiempo total real para 500 filas está medido en el reporte.
export const IMPORT_BATCH_SIZE = 25;

export type CsvColumnKey =
  | "tower"
  | "floor"
  | "number"
  | "type"
  | "firstName"
  | "lastName"
  | "phoneE164"
  | "email"
  | "notes"
  | "role"
  | "isPrimary"
  | "startedOn";

// El encabezado es lo único que el administrador ve y escribe a mano (o
// deja tal cual vino de la plantilla descargable) -- en español, sin
// depender de que respete mayúsculas ni tildes (buildHeaderIndex normaliza
// los dos lados antes de comparar).
export const CSV_COLUMNS: {
  key: CsvColumnKey;
  header: string;
  required: boolean;
  example: string;
}[] = [
  { key: "tower", header: "Torre", required: false, example: "" },
  { key: "floor", header: "Piso", required: true, example: "3" },
  { key: "number", header: "Número", required: true, example: "B" },
  { key: "type", header: "Tipo", required: true, example: "Departamento" },
  { key: "firstName", header: "Nombre", required: false, example: "Marta" },
  { key: "lastName", header: "Apellido", required: false, example: "Gómez" },
  {
    key: "phoneE164",
    header: "Teléfono",
    required: false,
    example: "+5493515551234",
  },
  {
    key: "email",
    header: "Email",
    required: false,
    example: "marta.gomez@example.com",
  },
  { key: "notes", header: "Notas", required: false, example: "" },
  { key: "role", header: "Rol", required: false, example: "Propietario" },
  { key: "isPrimary", header: "Principal", required: false, example: "Sí" },
  { key: "startedOn", header: "Desde", required: false, example: "01/03/2024" },
];

function normalizeHeader(value: string): string {
  return stripDiacritics(value).toLowerCase().trim();
}

export type HeaderIndexResult = {
  // Índice de columna (0-based) para cada clave que se pudo reconocer en el
  // archivo -- no todas las claves tienen que estar presentes (las
  // opcionales pueden faltar del todo).
  index: Partial<Record<CsvColumnKey, number>>;
  missingRequired: string[];
};

// Encabezados requeridos: los de la UNIDAD nada más. Los de persona/rol son
// requeridos POR FILA solo si esa fila carga una persona (ver
// resolveCsvRow) -- un archivo que solo carga unidades, sin ninguna
// columna de persona, es válido.
const REQUIRED_COLUMNS: CsvColumnKey[] = ["floor", "number", "type"];

export function buildHeaderIndex(rawHeaders: string[]): HeaderIndexResult {
  const byNormalizedHeader = new Map(
    CSV_COLUMNS.map((c) => [normalizeHeader(c.header), c.key]),
  );
  const index: Partial<Record<CsvColumnKey, number>> = {};
  rawHeaders.forEach((raw, i) => {
    const key = byNormalizedHeader.get(normalizeHeader(raw));
    if (key && !(key in index)) {
      index[key] = i;
    }
  });

  const missingRequired = REQUIRED_COLUMNS.filter((key) => !(key in index)).map(
    (key) => CSV_COLUMNS.find((c) => c.key === key)!.header,
  );

  return { index, missingRequired };
}

export type ResolvedCsvRow = {
  unit: UnitFormOutput;
  person: PersonFieldsOutput | null;
  occupancy: Omit<OccupancyFieldsOutput, "unitId"> | null;
};

export type CsvRowResult =
  | { rowNumber: number; status: "invalid"; issues: string[] }
  | { rowNumber: number; status: "valid"; row: ResolvedCsvRow };

const TYPE_BY_LABEL = new Map(
  UNIT_TYPES.map((type) => [normalizeHeader(UNIT_TYPE_LABEL[type]), type]),
);
const ROLE_BY_LABEL = new Map(
  OCCUPANCY_ROLES.map((role) => [
    normalizeHeader(OCCUPANCY_ROLE_LABEL[role]),
    role,
  ]),
);

const csvOccupancyFieldsSchema = occupancyFieldsSchema.omit({ unitId: true });

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const AR_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Acepta dd/mm/aaaa (el formato que un administrador argentino tipea o que
// trae un export de Excel) o aaaa-mm-dd (por si el archivo se generó a
// mano o desde otro sistema) -- vacío significa "hoy", igual que el
// default del formulario manual (PersonOccupancyForm). Valida que la fecha
// exista de verdad (31/02 no pasa) reconstruyéndola y comparando -- un
// `new Date(2026, 1, 31)` de JS no tira error, "desborda" a marzo, así que
// hay que chequear manualmente en vez de confiar en que el constructor
// falle.
function parseDateFlexible(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return today();
  }
  if (ISO_DATE.test(trimmed)) {
    return trimmed;
  }
  const match = trimmed.match(AR_DATE);
  if (!match) {
    return null;
  }
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  const isValid =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
  if (!isValid) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Interpretación laxa a propósito: "Sí", "si", "SI", "x", "X" cuentan como
// verdadero; cualquier otra cosa (incluido vacío) es falso. No hay un valor
// "inválido" que rebote la fila -- a diferencia del tipo o el rol, marcar
// mal esta columna no es un dato incorrecto, es simplemente "no lo marcó
// como principal", que es un resultado válido.
function parseBooleanLenient(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  return (
    trimmed === "si" || trimmed === "sí" || trimmed === "x" || trimmed === "1"
  );
}

// Valida y transforma UNA fila ya mapeada a claves canónicas (ver
// buildHeaderIndex) -- pura, sin tocar la base: la resolución contra datos
// existentes (¿esta unidad ya existe?, ¿este teléfono ya existe?, ¿esta
// persona ya tiene una ocupación vigente acá?) es responsabilidad de quien
// llama (previewImportAction en actions.ts), que tiene el contexto de la
// organización y del resto del archivo. Acá solo se decide si la fila,
// AISLADA, tiene la forma correcta.
export function resolveCsvRow(
  raw: Record<CsvColumnKey, string>,
  rowNumber: number,
): CsvRowResult {
  const issues: string[] = [];

  const typeLabel = raw.type.trim();
  const typeKey = TYPE_BY_LABEL.get(normalizeHeader(typeLabel));
  const unitParsed = unitFormSchema.safeParse({
    tower: raw.tower,
    floor: raw.floor,
    number: raw.number,
    type: typeKey ?? "__tipo_no_reconocido__",
  });
  if (!unitParsed.success) {
    for (const issue of unitParsed.error.issues) {
      if (issue.path[0] === "type") {
        issues.push(
          typeLabel
            ? `Tipo "${typeLabel}" no reconocido. Usá: ${UNIT_TYPES.map((t) => UNIT_TYPE_LABEL[t]).join(", ")}.`
            : "Ingresá un tipo de unidad.",
        );
      } else {
        issues.push(issue.message);
      }
    }
  }

  // Fila con persona: dispara en cuanto hay CUALQUIER dato de persona/rol,
  // no solo el nombre -- para que una fila con teléfono cargado pero
  // nombre vacío se reporte como error concreto ("falta el nombre") en vez
  // de tratarse en silencio como una fila "solo unidad" que ignora el
  // teléfono que alguien sí cargó.
  const personColumnValues = [
    raw.firstName,
    raw.lastName,
    raw.phoneE164,
    raw.email,
    raw.notes,
    raw.role,
    raw.isPrimary,
  ];
  const hasAnyPersonData = personColumnValues.some((v) => v.trim() !== "");
  const hasName = raw.firstName.trim() !== "";

  let person: ResolvedCsvRow["person"] = null;
  let occupancy: ResolvedCsvRow["occupancy"] = null;

  if (hasAnyPersonData && !hasName) {
    issues.push(
      "Falta el nombre del vecino -- hay otros datos de persona cargados en esta fila (teléfono, rol, etc.) pero no un nombre.",
    );
  } else if (hasName) {
    const personParsed = personFieldsSchema.safeParse({
      firstName: raw.firstName,
      lastName: raw.lastName,
      phoneE164: raw.phoneE164,
      email: raw.email,
      notes: raw.notes,
    });
    if (!personParsed.success) {
      for (const issue of personParsed.error.issues) {
        issues.push(issue.message);
      }
    }

    const roleLabel = raw.role.trim();
    const roleKey = ROLE_BY_LABEL.get(normalizeHeader(roleLabel));
    if (!roleLabel) {
      issues.push("Ingresá un rol (Propietario o Inquilino).");
    } else if (!roleKey) {
      issues.push(
        `Rol "${roleLabel}" no reconocido. Usá: ${OCCUPANCY_ROLES.map((r) => OCCUPANCY_ROLE_LABEL[r]).join(" o ")}.`,
      );
    }

    const startedOn = parseDateFlexible(raw.startedOn);
    if (startedOn === null) {
      issues.push(
        `Fecha inválida en "Desde" ("${raw.startedOn}"). Usá el formato dd/mm/aaaa.`,
      );
    }

    if (personParsed.success && roleKey && startedOn !== null) {
      const occupancyParsed = csvOccupancyFieldsSchema.safeParse({
        role: roleKey,
        isPrimary: parseBooleanLenient(raw.isPrimary),
        startedOn,
      });
      if (!occupancyParsed.success) {
        for (const issue of occupancyParsed.error.issues) {
          issues.push(issue.message);
        }
      } else {
        person = personParsed.data;
        occupancy = occupancyParsed.data;
      }
    }
  }

  if (!unitParsed.success || issues.length > 0) {
    return { rowNumber, status: "invalid", issues };
  }

  return {
    rowNumber,
    status: "valid",
    row: { unit: unitParsed.data, person, occupancy },
  };
}

// Plantilla descargable (decisión del reporte: "¿hay una plantilla
// descargable?", sí) -- misma lista de columnas (CSV_COLUMNS) que usa
// buildHeaderIndex para reconocer el archivo subido, así que la plantilla
// nunca puede desalinearse de lo que el importador realmente acepta. Dos
// filas de ejemplo: una unidad con un propietario (el caso típico) y una
// unidad sola sin persona (para mostrar que también es válido dejar las
// columnas de persona vacías -- ej. una cochera sin asignar todavía).
export function buildTemplateCsv(): string {
  const header = CSV_COLUMNS.map((c) => c.header).join(",");
  const exampleWithPerson = CSV_COLUMNS.map((c) => c.example).join(",");
  const exampleUnitOnly = [
    "",
    "4",
    "12",
    "Cochera",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ].join(",");
  return `${header}\n${exampleWithPerson}\n${exampleUnitOnly}\n`;
}

// Tipos y estado inicial del resultado de la previsualización (usados por
// actions.ts y por ImportDialog). Viven acá y no en actions.ts: un archivo
// "use server" solo puede exportar funciones async -- mismo motivo que
// separó BulkPreviewState/initialBulkPreviewState de units/actions.ts hacia
// unit-schema.ts en el paso 4.3. Encontrado en la práctica otra vez acá
// (paso 4.5): tenerlo como const en actions.ts rompía la carga de la
// Server Action con "A 'use server' file can only export async functions,
// found object."
export type ImportRowPreview =
  | { rowNumber: number; status: "error"; issues: string[] }
  | {
      rowNumber: number;
      status: "ready";
      unit: { label: string; existing: boolean };
      person: { label: string; existing: boolean } | null;
      occupancy: {
        roleLabel: string;
        isPrimary: boolean;
        startedOn: string;
        note: string | null;
      } | null;
    };

export type ImportPreviewSummary = {
  totalRows: number;
  errorRows: number;
  unitsToCreate: number;
  unitsExisting: number;
  peopleToCreate: number;
  peopleExisting: number;
  occupanciesToCreate: number;
};

// `parsedRows` viaja junto al resultado de la previsualización (entrega 2):
// son las mismas filas ya decodificadas/parseadas por el servidor (mismo
// orden, mismo `rowNumber`), listas para que el cliente arme las tandas de
// confirmImportBatchAction sin tener que volver a subir ni volver a
// parsear el archivo -- pero SÍ se vuelven a validar y a resolver contra
// la base, desde cero, en cada tanda (ver el comentario de
// resolveRowsAgainstDatabase() en actions.ts): esto es dato ya parseado
// por el servidor viajando de vuelta al cliente, no entrada del cliente sin
// validar, así que confiarlo acá no viola CLAUDE.md > Reglas de seguridad.
export type ImportPreviewState =
  | { status: "idle" }
  | { status: "file-error"; message: string }
  | {
      status: "ready";
      summary: ImportPreviewSummary;
      rows: ImportRowPreview[];
      parsedRows: { rowNumber: number; raw: Record<CsvColumnKey, string> }[];
    };

export const initialImportPreviewState: ImportPreviewState = { status: "idle" };

// Resultado de escribir UNA tanda (entrega 2) -- ver confirmImportBatchAction
// en actions.ts. Vive acá por el mismo motivo que ImportPreviewState.
export type ImportRowError = { rowNumber: number; message: string };

export type ImportBatchResult = {
  processedRows: number;
  unitsCreated: number;
  unitsReused: number;
  peopleCreated: number;
  peopleReused: number;
  occupanciesCreated: number;
  errors: ImportRowError[];
};
