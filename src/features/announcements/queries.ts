import "server-only";

import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  announcementRecipients,
  announcements,
  buildings,
  people,
  unitOccupancies,
  units,
} from "@/db/schema";
import { getPhoneIssue, type PhoneIssue } from "@/lib/phone";

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
//
// `qualifiedWithPhone` exige un teléfono VÁLIDO, no solo cargado (paso
// 8.7) -- antes de esta corrección, una persona con un phone_e164 cargado
// pero mal formateado (nunca pasó por personFieldsSchema.refine(), ver
// CLAUDE.md > Validación de teléfonos) contaba acá como "con teléfono", y
// terminaba materializada como 'pending' con un link de WhatsApp roto (ver
// materializeAnnouncementRecipientsAction, actions.ts). `getPhoneIssue`
// (src/lib/phone.ts) es el único punto que decide esto ahora, reusado
// también por getExcludedSegmentRecipients (mismo criterio, detalle por
// persona en vez de solo el número).
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
    if (getPhoneIssue(phone) === null) {
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
  // Paso 8.7 -- `null` = teléfono válido, va a recibir el aviso. Mismo
  // criterio que countSegmentRecipients/getExcludedSegmentRecipients
  // (getPhoneIssue, src/lib/phone.ts): distingue "nunca se cargó" de
  // "cargado pero con formato inválido", en vez del `!!phoneE164` que
  // usaba este campo antes de este paso.
  phoneIssue: PhoneIssue | null;
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
      phoneIssue: getPhoneIssue(person.phoneE164),
    };
  });
}

// Para cuántos edificios distintos tiene ocupación cada persona de una
// lista (paso 8.7) -- resuelve a QUÉ edificio linkear "corregir esta
// ficha" desde un comunicado, que puede ser de toda la organización (sin
// un edificio de referencia propio). Una sola fila por persona
// (`selectDistinctOn`), sin importar cuántas ocupaciones tenga: prioriza
// una VIGENTE (`ended_on IS NULL`) por sobre una finalizada, y entre
// varias vigentes/finalizadas, la de `started_on` más reciente -- no hace
// falta más precisión que esa para un link que solo necesita llevar al
// administrador a la pantalla correcta, no identificar "la" ocupación
// canónica de la persona (no existe tal cosa). Una persona sin NINGUNA
// ocupación (agregada al segmento por `personIds` sin tener ninguna unidad
// asignada, ver CLAUDE.md > Constructor de segmentos) no aparece en el
// resultado -- no hay ningún edificio al que enviar al administrador
// (mismo límite ya documentado en CLAUDE.md > Pendientes, "un vecino sin
// ocupación es invisible en el panel"). Exportada: dos consumidores reales
// (getExcludedSegmentRecipients acá abajo, y send/page.tsx para el link de
// corrección de un destinatario ya materializado 'skipped').
export async function getEditBuildingIdsForPeople(
  organizationId: string,
  personIds: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (personIds.length === 0) {
    return result;
  }

  const rows = await db
    .selectDistinctOn([unitOccupancies.personId], {
      personId: unitOccupancies.personId,
      buildingId: units.buildingId,
    })
    .from(unitOccupancies)
    .innerJoin(
      units,
      and(
        eq(units.id, unitOccupancies.unitId),
        eq(units.organizationId, unitOccupancies.organizationId),
      ),
    )
    .where(
      and(
        eq(unitOccupancies.organizationId, organizationId),
        inArray(unitOccupancies.personId, personIds),
        isNull(unitOccupancies.deletedAt),
        isNull(units.deletedAt),
      ),
    )
    .orderBy(
      unitOccupancies.personId,
      desc(sql`(${unitOccupancies.endedOn} is null)`),
      desc(unitOccupancies.startedOn),
    );

  for (const row of rows) {
    result.set(row.personId, row.buildingId);
  }
  return result;
}

export type ExcludedSegmentRecipient = {
  id: string;
  name: string;
  phoneE164: string | null;
  issue: PhoneIssue;
  // `null` cuando la persona no tiene NINGUNA ocupación en ningún
  // edificio -- ver el comentario de getEditBuildingIdsForPeople. La UI
  // que consume esto (ExcludedRecipientsList) muestra un texto explicando
  // por qué no hay link, en vez de esconder a la persona de la lista.
  editHref: string | null;
};

// Detalle de "quién queda excluido y por qué" (paso 8.7) -- reusa
// findPeopleByCriteria/findPeopleByIds TAL CUAL (mismo merge que
// countSegmentRecipients/getSegmentRecipientsForPreview), así que esta
// lista nunca puede desincronizarse del conteo agregado que ya muestra el
// editor (8.2) o la vista previa (8.4): las tres parten de la misma
// consulta base. Se pide APARTE (no siempre junto al conteo) porque
// resolver el edificio de cada excluido es una consulta extra --barata,
// pero innecesaria mientras el administrador no pidió ver el detalle.
export async function getExcludedSegmentRecipients(
  organizationId: string,
  buildingId: string | null,
  criteria: SegmentCriteria,
): Promise<ExcludedSegmentRecipient[]> {
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

  const excluded = [...merged.values()]
    .map((row) => ({ row, issue: getPhoneIssue(row.phoneE164) }))
    .filter(
      (entry): entry is { row: SegmentPersonRow; issue: PhoneIssue } =>
        entry.issue !== null,
    );

  if (excluded.length === 0) {
    return [];
  }

  const editBuildingIds = await getEditBuildingIdsForPeople(
    organizationId,
    excluded.map((entry) => entry.row.id),
  );

  return excluded.map(({ row, issue }) => {
    const editBuildingId = editBuildingIds.get(row.id) ?? null;
    return {
      id: row.id,
      name: [row.firstName, row.lastName].filter(Boolean).join(" "),
      phoneE164: row.phoneE164,
      issue,
      editHref: editBuildingId
        ? `/panel/buildings/${editBuildingId}/people?editPerson=${row.id}`
        : null,
    };
  });
}

// Los cinco valores reales de announcements.status (enum de la base,
// etapa 2.5) -- ver src/db/schema/announcements.ts. Repetido acá como tipo
// literal en vez de derivado de Drizzle porque este archivo no necesita
// importar el objeto del enum entero solo para su tipo.
export type AnnouncementStatus =
  "draft" | "scheduled" | "sending" | "sent" | "failed";

export type AnnouncementForSend = {
  id: string;
  title: string;
  body: string;
  buildingId: string | null;
  segment: SegmentCriteria;
  status: AnnouncementStatus;
};

// Carga un aviso para la pantalla de envío (paso 8.5) -- a diferencia de
// getAnnouncementDraftForEdit (8.3), NO filtra por `status = 'draft'`: el
// editor y la vista previa dejan de ser alcanzables en cuanto el envío
// arranca (materializar destinatarios pasa `status` a 'sending', ver
// materializeAnnouncementRecipientsAction en actions.ts) a propósito --
// un borrador que ya empezó a mandarse no debería poder editarse -- pero
// ESTA pantalla es la que sigue viva durante todo ese tiempo (`sending` y
// después `sent`), así que necesita poder cargar el aviso en cualquier
// estado no borrado.
export async function getAnnouncementForSend(
  organizationId: string,
  id: string,
): Promise<AnnouncementForSend | null> {
  const [row] = await db
    .select({
      id: announcements.id,
      title: announcements.title,
      body: announcements.body,
      buildingId: announcements.buildingId,
      segment: announcements.segment,
      status: announcements.status,
    })
    .from(announcements)
    .where(
      and(
        eq(announcements.id, id),
        eq(announcements.organizationId, organizationId),
        isNull(announcements.deletedAt),
      ),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  const parsedSegment = segmentCriteriaSchema.safeParse(row.segment);

  return {
    id: row.id,
    title: row.title,
    body: row.body,
    buildingId: row.buildingId,
    segment: parsedSegment.success
      ? parsedSegment.data
      : EMPTY_SEGMENT_CRITERIA,
    status: row.status,
  };
}

export type MaterializedRecipient = {
  id: string;
  personId: string;
  firstName: string;
  lastName: string | null;
  phoneSnapshot: string | null;
  messageSnapshot: string | null;
  deliveryStatus: "pending" | "link_opened" | "failed" | "skipped";
  errorMessage: string | null;
  sentAt: Date | null;
};

// Filas YA MATERIALIZADAS de announcement_recipients (paso 8.5) -- nunca
// vuelve a correr la query de segmento, a diferencia de
// getSegmentRecipientsForPreview: una vez que existen filas para este
// aviso, son la ÚNICA fuente de verdad (ver el comentario de
// materializeAnnouncementRecipientsAction, actions.ts, para la regla
// completa de "se materializa una sola vez"). Nombre sale de un JOIN en
// vivo contra `people` (puede mostrar un nombre editado después, sin
// problema -- lo que SÍ se congela es el teléfono/mensaje, ver el
// comentario de esas dos columnas); nunca se filtra por
// `people.deleted_at`: un destinatario de un envío ya hecho no debería
// desaparecer de su propio historial solo porque la persona se dio de
// baja después.
export async function getMaterializedRecipients(
  organizationId: string,
  announcementId: string,
): Promise<MaterializedRecipient[]> {
  return db
    .select({
      id: announcementRecipients.id,
      personId: announcementRecipients.personId,
      firstName: people.firstName,
      lastName: people.lastName,
      phoneSnapshot: announcementRecipients.phoneSnapshot,
      messageSnapshot: announcementRecipients.messageSnapshot,
      deliveryStatus: announcementRecipients.deliveryStatus,
      errorMessage: announcementRecipients.errorMessage,
      sentAt: announcementRecipients.sentAt,
    })
    .from(announcementRecipients)
    .innerJoin(
      people,
      and(
        eq(people.id, announcementRecipients.personId),
        eq(people.organizationId, announcementRecipients.organizationId),
      ),
    )
    .where(
      and(
        eq(announcementRecipients.announcementId, announcementId),
        eq(announcementRecipients.organizationId, organizationId),
        isNull(announcementRecipients.deletedAt),
      ),
    )
    .orderBy(people.firstName, people.lastName);
}

export type AnnouncementListRow = {
  id: string;
  title: string;
  status: AnnouncementStatus;
  buildingId: string | null;
  buildingName: string | null;
  createdAt: Date;
  sentAt: Date | null;
  segment: SegmentCriteria;
};

// Listado principal de /panel/announcements (paso 8.6) -- una fila por
// aviso, más reciente primero. LEFT JOIN a buildings (no INNER): un aviso
// de "toda la organización" tiene building_id NULL a propósito (ver el
// comentario de esa columna) y tiene que seguir apareciendo en la lista, no
// desaparecer por el JOIN. `segment` viaja crudo (revalidado acá con Zod,
// mismo criterio que getAnnouncementDraftForEdit/getAnnouncementForSend)
// porque los borradores sin materializar necesitan volver a contar su
// segmento en vivo (ver getAnnouncementRecipientSummaries más abajo) -- sin
// esto, page.tsx tendría que pedir el segmento aparte por cada borrador.
export async function getAnnouncementsList(
  organizationId: string,
): Promise<AnnouncementListRow[]> {
  const rows = await db
    .select({
      id: announcements.id,
      title: announcements.title,
      status: announcements.status,
      buildingId: announcements.buildingId,
      buildingName: buildings.name,
      createdAt: announcements.createdAt,
      sentAt: announcements.sentAt,
      segment: announcements.segment,
    })
    .from(announcements)
    .leftJoin(
      buildings,
      and(
        eq(buildings.id, announcements.buildingId),
        eq(buildings.organizationId, announcements.organizationId),
      ),
    )
    .where(
      and(
        eq(announcements.organizationId, organizationId),
        isNull(announcements.deletedAt),
      ),
    )
    .orderBy(desc(announcements.createdAt));

  return rows.map((row) => {
    const parsedSegment = segmentCriteriaSchema.safeParse(row.segment);
    return {
      ...row,
      segment: parsedSegment.success
        ? parsedSegment.data
        : EMPTY_SEGMENT_CRITERIA,
    };
  });
}

export type AnnouncementRecipientSummary = {
  total: number;
  linkOpened: number;
  withoutPhone: number;
};

// Resumen "enviados/total, sin teléfono" para avisos YA MATERIALIZADOS
// (paso 8.6) -- UNA sola consulta agrupada para TODOS los avisos de la
// página a la vez (mismo patrón que getTicketStatusCounts, paso 6.6), no
// una consulta por fila. `link_opened` es "enviados" (ver el comentario de
// announcement_recipients.delivery_status: es el único estado terminal de
// éxito de Fase 1); `skipped` es siempre "sin teléfono" -- la única razón
// por la que materializeAnnouncementRecipientsAction (actions.ts) produce
// ese estado (confirmado leyendo esa función antes de escribir esta
// consulta, no asumido).
export async function getAnnouncementRecipientSummaries(
  organizationId: string,
  announcementIds: string[],
): Promise<Map<string, AnnouncementRecipientSummary>> {
  const result = new Map<string, AnnouncementRecipientSummary>();
  if (announcementIds.length === 0) {
    return result;
  }

  const rows = await db
    .select({
      announcementId: announcementRecipients.announcementId,
      deliveryStatus: announcementRecipients.deliveryStatus,
      count: sql<string>`count(*)`,
    })
    .from(announcementRecipients)
    .where(
      and(
        eq(announcementRecipients.organizationId, organizationId),
        inArray(announcementRecipients.announcementId, announcementIds),
        isNull(announcementRecipients.deletedAt),
      ),
    )
    .groupBy(
      announcementRecipients.announcementId,
      announcementRecipients.deliveryStatus,
    );

  for (const row of rows) {
    const count = Number(row.count);
    const existing = result.get(row.announcementId) ?? {
      total: 0,
      linkOpened: 0,
      withoutPhone: 0,
    };
    existing.total += count;
    if (row.deliveryStatus === "link_opened") {
      existing.linkOpened += count;
    } else if (row.deliveryStatus === "skipped") {
      existing.withoutPhone += count;
    }
    result.set(row.announcementId, existing);
  }

  return result;
}
