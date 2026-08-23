import "server-only";

import { and, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { announcements, people, unitOccupancies, units } from "@/db/schema";

import {
  EMPTY_SEGMENT_CRITERIA,
  segmentCriteriaSchema,
  type SegmentCriteria,
  type SegmentRecipientCount,
} from "./segment-schema";

export type BuildingTowersAndFloors = {
  towers: string[];
  floors: string[];
};

// Opciones para los selectores de torre/piso del constructor de segmentos
// (paso 8.2) -- valores DISTINCT que existen de verdad en las unidades de
// este edificio, no una lista fija (mismo criterio ya usado para el
// filtro de responsable de la bandeja de reclamos, paso 6.1:
// getAssigneeFilterOptions -- ofrecer solo lo que existe, no inventar
// opciones). `towers` puede salir vacío (muchos edificios no tienen
// torres, ver units.tower) -- el caller esconde el selector de torres en
// ese caso, no lo muestra vacío.
//
// sort con `numeric: true` (Intl-aware): "piso" es TEXT en la base (units.
// floor -- "PB", "EP", "Subsuelo 1" son válidos, no solo números), así que
// un sort alfabético puro pondría "10" antes que "2". `numeric: true`
// intercala números y texto de forma razonable ("1", "2", ..., "10",
// "PB") sin necesitar inventar un esquema de orden custom para casos que
// el modelo no distingue.
export async function getBuildingTowersAndFloors(
  organizationId: string,
  buildingId: string,
): Promise<BuildingTowersAndFloors> {
  const rows = await db
    .selectDistinct({ tower: units.tower, floor: units.floor })
    .from(units)
    .where(
      and(
        eq(units.organizationId, organizationId),
        eq(units.buildingId, buildingId),
        isNull(units.deletedAt),
      ),
    );

  const collator = new Intl.Collator("es", { numeric: true });
  const towers = [
    ...new Set(rows.map((r) => r.tower).filter((t): t is string => !!t)),
  ].sort(collator.compare);
  const floors = [...new Set(rows.map((r) => r.floor))].sort(collator.compare);

  return { towers, floors };
}

// Paso 8.4 -- se agregó firstName/lastName (antes solo id/phoneE164): la
// vista previa de destinatarios necesita el nombre real de cada persona
// para resolver {{nombre}}, y reusar la MISMA fila que ya calcula el
// segmento (en vez de una consulta aparte) es lo que garantiza que la
// lista de la vista previa y el conteo del paso 8.2 nunca puedan
// desincronizarse entre sí -- las dos leen exactamente el mismo resultado
// de findPeopleByCriteria/findPeopleByIds.
type SegmentPersonRow = {
  id: string;
  firstName: string;
  lastName: string | null;
  phoneE164: string | null;
};

// Personas que califican por los criterios GENERALES (torre/piso/rol) --
// AND entre categorías (una unidad tiene que matchear torre Y piso, si
// los dos están seteados), OR dentro de una misma categoría (cualquiera
// de las torres elegidas, cualquiera de los pisos, cualquiera de los
// roles) -- ver CLAUDE.md > Constructor de segmentos para el criterio
// completo, confirmado en el reporte del paso 8.2.
//
// `buildingId === null` (aviso de TODA la organización): towers/floors se
// IGNORAN a propósito, mismo criterio que ya documenta
// announcements.segment ("towers/floors dejan de tener sentido sin un
// edificio de referencia") -- la UI ya no ofrece esos controles en ese
// caso, esto es la segunda capa de la misma regla, no confiada solo al
// cliente.
//
// selectDistinct sobre (id, phoneE164): una persona con más de una
// ocupación vigente que califica (ej. propietaria de dos unidades del
// mismo piso) no debe contarse dos veces -- phoneE164 es un atributo de
// la PERSONA, no de la ocupación, así que nunca varía entre sus propias
// filas, y distinct sobre el par colapsa correctamente a una fila por
// persona.
async function findPeopleByCriteria(
  organizationId: string,
  buildingId: string | null,
  criteria: Pick<SegmentCriteria, "towers" | "floors" | "roles">,
): Promise<SegmentPersonRow[]> {
  const conditions = [
    eq(unitOccupancies.organizationId, organizationId),
    isNull(unitOccupancies.endedOn),
    isNull(unitOccupancies.deletedAt),
    isNull(units.deletedAt),
    isNull(people.deletedAt),
  ];

  if (buildingId) {
    conditions.push(eq(units.buildingId, buildingId));
    if (criteria.towers.length > 0) {
      conditions.push(inArray(units.tower, criteria.towers));
    }
    if (criteria.floors.length > 0) {
      conditions.push(inArray(units.floor, criteria.floors));
    }
  }

  if (criteria.roles.length > 0) {
    conditions.push(inArray(unitOccupancies.role, criteria.roles));
  }

  return db
    .selectDistinct({
      id: people.id,
      firstName: people.firstName,
      lastName: people.lastName,
      phoneE164: people.phoneE164,
    })
    .from(unitOccupancies)
    .innerJoin(
      units,
      and(
        eq(units.id, unitOccupancies.unitId),
        eq(units.organizationId, unitOccupancies.organizationId),
      ),
    )
    .innerJoin(
      people,
      and(
        eq(people.id, unitOccupancies.personId),
        eq(people.organizationId, unitOccupancies.organizationId),
      ),
    )
    .where(and(...conditions));
}

// Personas agregadas a mano por id (paso 8.2) -- ADITIVO sobre las
// generales, ver el comentario reinterpretado de announcements.segment.
// A diferencia de findPeopleByCriteria, NO exige ninguna ocupación: el
// enunciado pide poder sumar a alguien que "no calificaría por los
// criterios generales" (ej. sin unidad asignada todavía).
async function findPeopleByIds(
  organizationId: string,
  personIds: string[],
): Promise<SegmentPersonRow[]> {
  if (personIds.length === 0) {
    return [];
  }
  return db
    .select({
      id: people.id,
      firstName: people.firstName,
      lastName: people.lastName,
      phoneE164: people.phoneE164,
    })
    .from(people)
    .where(
      and(
        eq(people.organizationId, organizationId),
        inArray(people.id, personIds),
        isNull(people.deletedAt),
      ),
    );
}

// Conteo en vivo (paso 8.2) -- corre contra datos REALES en cada llamada,
// nunca un estimado ni un mock (pedido explícito del enunciado). Une el
// resultado de los criterios generales con las personas agregadas a mano
// en un Map keyeado por persona (dedupe real, no solo "no debería
// duplicarse"): una persona que calificaría por rol Y fue agregada a mano
// aparece una sola vez.
export async function countSegmentRecipients(
  organizationId: string,
  buildingId: string | null,
  criteria: SegmentCriteria,
): Promise<SegmentRecipientCount> {
  const [criteriaPeople, explicitPeople] = await Promise.all([
    findPeopleByCriteria(organizationId, buildingId, criteria),
    findPeopleByIds(organizationId, criteria.personIds),
  ]);

  const merged = new Map<string, string | null>();
  for (const row of criteriaPeople) {
    merged.set(row.id, row.phoneE164);
  }
  for (const row of explicitPeople) {
    merged.set(row.id, row.phoneE164);
  }

  let qualifiedWithPhone = 0;
  let qualifiedWithoutPhone = 0;
  for (const phone of merged.values()) {
    if (phone) {
      qualifiedWithPhone++;
    } else {
      qualifiedWithoutPhone++;
    }
  }

  return { qualifiedWithPhone, qualifiedWithoutPhone };
}

export type PersonSearchResult = {
  id: string;
  firstName: string;
  lastName: string | null;
  phoneE164: string | null;
};

// Búsqueda para "agregar una persona a mano" (paso 8.2) -- ILIKE simple
// sobre nombre/apellido/teléfono, mismo criterio que la búsqueda de la
// bandeja de reclamos (paso 6.1): mínimo 2 caracteres antes de golpear la
// base (un solo caracter no filtra nada real). Organización SIEMPRE en el
// WHERE -- ver CLAUDE.md > Acceso a datos.
export async function searchPeopleForSegment(
  organizationId: string,
  query: string,
  limit = 10,
): Promise<PersonSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return [];
  }
  const pattern = `%${trimmed}%`;

  return db
    .select({
      id: people.id,
      firstName: people.firstName,
      lastName: people.lastName,
      phoneE164: people.phoneE164,
    })
    .from(people)
    .where(
      and(
        eq(people.organizationId, organizationId),
        isNull(people.deletedAt),
        or(
          ilike(people.firstName, pattern),
          ilike(people.lastName, pattern),
          ilike(people.phoneE164, pattern),
          // Nombre completo concatenado -- CORRECCIÓN encontrada probando
          // este mismo paso con datos reales: buscar "Claudia Rojas" (el
          // nombre completo, como cualquiera escribiría para encontrar a
          // alguien) daba CERO resultados sin esta rama, porque ni
          // first_name ("Claudia") NI last_name ("Rojas") por separado
          // contienen el string "Claudia Rojas" completo -- cada ILIKE de
          // arriba compara contra UNA sola columna, nunca contra los dos
          // nombres juntos. `first_name || ' ' || coalesce(last_name, '')`
          // arma el mismo "Nombre Apellido" que ya se muestra en el
          // resultado (ver personLabel() en el componente), así que
          // buscar exactamente lo que se ve en pantalla ahora encuentra a
          // la persona.
          ilike(
            sql`${people.firstName} || ' ' || coalesce(${people.lastName}, '')`,
            pattern,
          ),
        ),
      ),
    )
    .limit(limit);
}

// Personas agregadas a mano de un segmento YA GUARDADO (paso 8.3) -- a
// diferencia de searchPeopleForSegment (busca CANDIDATOS nuevos por
// nombre/teléfono), esta trae la ficha de personas cuyo ID YA vive en
// `segment.personIds`, para poder repoblar los chips removibles del
// formulario al reabrir un borrador. Mismo shape que PersonSearchResult
// (así el cliente puede reusar el mismo personLabel()).
export async function getPeopleForSegmentDisplay(
  organizationId: string,
  personIds: string[],
): Promise<PersonSearchResult[]> {
  if (personIds.length === 0) {
    return [];
  }
  return db
    .select({
      id: people.id,
      firstName: people.firstName,
      lastName: people.lastName,
      phoneE164: people.phoneE164,
    })
    .from(people)
    .where(
      and(
        eq(people.organizationId, organizationId),
        inArray(people.id, personIds),
        isNull(people.deletedAt),
      ),
    );
}

export type AnnouncementDraftForEdit = {
  id: string;
  title: string;
  body: string;
  buildingId: string | null;
  segment: SegmentCriteria;
  templateId: string | null;
  templateVariables: Record<string, string>;
};

// Carga un borrador YA EXISTENTE para reabrirlo en el editor (paso 8.3) --
// la fuente de verdad detrás de "recargar la pantalla y que el estado
// persista": esta consulta corre fresca en cada carga de
// /panel/announcements/[id], nunca depende de estado de React. Solo
// borradores (`status = 'draft'`) -- mismo criterio que
// updateAnnouncementDraftAction (actions.ts): un aviso que ya avanzó de
// estado no se reabre por esta vía. `segment`/`templateVariables` son
// jsonb sin garantía de forma a nivel de base -- se revalidan con Zod acá
// (mismo criterio que `ticket_events.payload` en describeTicketEvent, paso
// 6.3): un valor viejo o corrupto cae al default vacío en vez de tirar,
// nunca rompe la carga de la pantalla entera por un campo.
export async function getAnnouncementDraftForEdit(
  organizationId: string,
  id: string,
): Promise<AnnouncementDraftForEdit | null> {
  const [row] = await db
    .select({
      id: announcements.id,
      title: announcements.title,
      body: announcements.body,
      buildingId: announcements.buildingId,
      segment: announcements.segment,
      templateId: announcements.templateId,
      templateVariables: announcements.templateVariables,
    })
    .from(announcements)
    .where(
      and(
        eq(announcements.id, id),
        eq(announcements.organizationId, organizationId),
        eq(announcements.status, "draft"),
        isNull(announcements.deletedAt),
      ),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  const parsedSegment = segmentCriteriaSchema.safeParse(row.segment);
  const parsedVariables = z
    .record(z.string(), z.string())
    .safeParse(row.templateVariables);

  return {
    id: row.id,
    title: row.title,
    body: row.body,
    buildingId: row.buildingId,
    segment: parsedSegment.success
      ? parsedSegment.data
      : EMPTY_SEGMENT_CRITERIA,
    templateId: row.templateId,
    templateVariables: parsedVariables.success ? parsedVariables.data : {},
  };
}

// Etiqueta de unidad para un destinatario (paso 8.4) -- misma fórmula que
// formatUnitLabel (public-form/components/unit-combobox.tsx) y que el
// `unitLabel` ya inline en public-form/queries.ts: "torre - piso°número" o
// "piso°número" sin torre. Se repite acá en vez de importar porque las dos
// existentes viven una en un componente "use client" y otra ya se decidió
// duplicar en vez de extraer para su primer consumidor server-side (mismo
// criterio de ese archivo: dos líneas se duplican más simple que armar un
// módulo compartido para una fórmula tan chica) -- este es un tercer
// consumidor de la MISMA fórmula, no una versión distinta.
function formatUnitLabelForPreview(unit: {
  tower: string | null;
  floor: string;
  number: string;
}): string {
  const base = `${unit.floor}°${unit.number}`;
  return unit.tower ? `${unit.tower} - ${base}` : base;
}

// Unidades VIGENTES de cada persona, acotadas al mismo alcance que el
// segmento (paso 8.4) -- si el aviso es de un edificio puntual, solo cuentan
// las unidades de ESE edificio (una persona agregada a mano podría tener
// unidades en OTRO edificio, que no vienen al caso acá); si es de "toda la
// organización" (buildingId null), cuentan todas sus unidades vigentes sin
// importar el edificio -- no hay un edificio de referencia para acotar,
// mismo criterio que ya usa findPeopleByCriteria con towers/floors. Una
// persona con más de una ocupación vigente (ej. propietaria de dos
// unidades) devuelve más de una etiqueta -- ver resolveRecipientPlaceholders
// (templates.ts) para cómo se combinan en el texto final.
async function getActiveUnitLabelsByPerson(
  organizationId: string,
  buildingId: string | null,
  personIds: string[],
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (personIds.length === 0) {
    return result;
  }

  const conditions = [
    eq(unitOccupancies.organizationId, organizationId),
    isNull(unitOccupancies.endedOn),
    isNull(unitOccupancies.deletedAt),
    isNull(units.deletedAt),
    inArray(unitOccupancies.personId, personIds),
  ];
  if (buildingId) {
    conditions.push(eq(units.buildingId, buildingId));
  }

  const rows = await db
    .select({
      personId: unitOccupancies.personId,
      tower: units.tower,
      floor: units.floor,
      number: units.number,
    })
    .from(unitOccupancies)
    .innerJoin(
      units,
      and(
        eq(units.id, unitOccupancies.unitId),
        eq(units.organizationId, unitOccupancies.organizationId),
      ),
    )
    .where(and(...conditions));

  const collator = new Intl.Collator("es", { numeric: true });
  for (const row of rows) {
    const label = formatUnitLabelForPreview(row);
    const existing = result.get(row.personId) ?? [];
    if (!existing.includes(label)) {
      existing.push(label);
    }
    result.set(row.personId, existing);
  }
  for (const labels of result.values()) {
    labels.sort(collator.compare);
  }
  return result;
}

export type SegmentRecipientPreview = {
  id: string;
  firstName: string;
  lastName: string | null;
  phoneE164: string | null;
  // Etiquetas de unidad vigente dentro del alcance del aviso -- array
  // vacío = sin ninguna (ver el comentario de resolveRecipientPlaceholders
  // en templates.ts para cómo se refleja eso en el mensaje final).
  unitLabels: string[];
};

// Vista previa de destinatarios (paso 8.4) -- la MISMA lista que
// countSegmentRecipients (paso 8.2) cuenta, ahora con los datos completos
// para nombrar a cada persona y resolver sus placeholders por destinatario.
// Reusa findPeopleByCriteria/findPeopleByIds TAL CUAL (mismo merge por Map
// keyeado por persona, mismo criterio AND/OR/unión ya documentado) -- esto
// es lo que garantiza, por construcción y no por casualidad, que esta lista
// y el conteo del 8.2 nunca puedan mostrar números distintos para el mismo
// segmento: las dos funciones parten de la misma consulta.
export async function getSegmentRecipientsForPreview(
  organizationId: string,
  buildingId: string | null,
  criteria: SegmentCriteria,
): Promise<SegmentRecipientPreview[]> {
  const [criteriaPeople, explicitPeople] = await Promise.all([
    findPeopleByCriteria(organizationId, buildingId, criteria),
    findPeopleByIds(organizationId, criteria.personIds),
  ]);

  const merged = new Map<string, SegmentPersonRow>();
  for (const row of criteriaPeople) {
    merged.set(row.id, row);
  }
  for (const row of explicitPeople) {
    merged.set(row.id, row);
  }

  const personIds = [...merged.keys()];
  const unitLabelsByPerson = await getActiveUnitLabelsByPerson(
    organizationId,
    buildingId,
    personIds,
  );

  return personIds.map((id) => {
    const person = merged.get(id)!;
    return {
      id,
      firstName: person.firstName,
      lastName: person.lastName,
      phoneE164: person.phoneE164,
      unitLabels: unitLabelsByPerson.get(id) ?? [],
    };
  });
}
