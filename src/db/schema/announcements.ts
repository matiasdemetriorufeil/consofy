import {
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { denyAnonAuthenticated, idColumn, timestamps } from "./_shared";
import { buildings } from "./buildings";
import { organizations } from "./organizations";

export const announcementStatus = pgEnum("announcement_status", [
  "draft",
  "scheduled",
  "sending",
  "sent",
  "failed",
]);

export const announcements = pgTable(
  "announcements",
  {
    id: idColumn(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    // Nullable: un aviso de TODA la organización tiene sentido en este
    // producto -- un administrador con varios edificios va a querer mandar
    // "feliz año nuevo" una sola vez, no repetirlo edificio por edificio.
    // Cuando es NULL, segment (ver abajo) es la única forma de acotar
    // destinatarios; en la práctica "towers"/"floors" dejan de tener
    // sentido sin un edificio de referencia (no hay una "torre 2" que
    // cruce edificios distintos), así que un aviso NULL en general solo va
    // a filtrar por roles o personas puntuales.
    buildingId: uuid("building_id"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    // Criterio de destinatarios, validado con Zod en la capa de aplicación
    // (no acá, ver segmentCriteriaSchema en
    // src/features/announcements/segment-schema.ts). Forma esperada:
    //   {
    //     towers: string[];                 // solo relevante con
    //                                        // building_id != null
    //     floors: string[];                 // idem
    //     roles: ("owner" | "tenant")[];
    //     personIds: string[];
    //   }
    // Objeto con arrays vacíos = todos los destinatarios elegibles del
    // alcance (el edificio, o toda la organización si building_id es
    // NULL).
    //
    // REINTERPRETADO en el paso 8.2 -- semántica anterior de este
    // comentario (dejada acá tachada en el historial de git, no en el
    // código): "si personIds está presente, ANULA el resto de los
    // filtros". El paso 8.2 pide explícitamente poder agregar personas
    // individuales ADEMÁS de los criterios generales (no solo en
    // reemplazo) -- `personIds` ahora es SIEMPRE aditivo: el segmento
    // final es la UNIÓN (personas que califican por torres/pisos/roles)
    // ∪ (personas de personIds), deduplicada por persona. El caso "en
    // lugar de" sigue siendo alcanzable tal cual (dejar towers/floors/
    // roles vacíos y cargar solo personIds), así que la unión es
    // estrictamente más expresiva que la semántica anterior, no una
    // ruptura de compatibilidad -- ver CLAUDE.md > Constructor de
    // segmentos, paso 8.2, para el razonamiento completo.
    //
    // "edificio uno o varios" del enunciado del plan, interpretado contra
    // el esquema real (que ya modela `building_id` como UN uuid nullable,
    // no un array): un aviso apunta a UN edificio puntual, o a NULL
    // ("toda la organización", ver el comentario de building_id arriba)
    // -- eso ya cubre el caso de negocio real que motivaba "varios"
    // (mandar el mismo aviso a más de un edificio sin repetirlo). No se
    // agregó soporte para un subconjunto arbitrario de edificios
    // específicos: hubiera exigido cambiar building_id por un array,
    // deshaciendo una decisión ya tomada y documentada de la etapa 2.5
    // sin una necesidad de negocio real que lo pida.
    segment: jsonb("segment").notNull().default({}),
    // Paso 8.3 -- plantillas reutilizables con variables. Las plantillas en
    // sí NO viven en una tabla (ver el comentario de
    // src/features/announcements/templates.ts para por qué): `templateId`
    // es simplemente el `id` de una de esas plantillas hardcodeadas
    // (ej. "corte-de-agua"), o NULL si el aviso se escribió sin plantilla
    // ("en blanco"). Sin FK a propósito -- no hay tabla del lado
    // referenciado. Si el código borra o renombra una plantilla más
    // adelante, un borrador viejo simplemente deja de encontrar el match
    // (`getAnnouncementTemplate()` devuelve undefined) y el editor cae al
    // modo "sin plantilla" -- sin romper nada, porque `body` (abajo) ya
    // guardó el texto final, no depende de que la plantilla siga existiendo.
    templateId: text("template_id"),
    // Valores de las variables DE COMUNICADO (fecha, horario, motivo...),
    // completadas una sola vez para todo el segmento -- NUNCA valores por
    // destinatario (nombre/unidad se resuelven recién en el paso 8.5). Se
    // guardan por separado de `body` para poder REPOBLAR los campos del
    // formulario al reabrir un borrador (`body` por sí solo ya tiene el
    // texto final sustituido, pero no alcanza para reconstruir qué se
    // tipeó en cada campo). `{}` en modo "sin plantilla".
    templateVariables: jsonb("template_variables").notNull().default({}),
    status: announcementStatus("status").notNull().default("draft"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    // Texto libre a propósito, mismo motivo que tickets.assignee: todavía
    // no existe una tabla de usuarios del panel. Distinto de assignee en
    // nullability: quien crea un aviso siempre se conoce en el momento de
    // crearlo (no hay un estado "sin autor todavía").
    createdBy: text("created_by").notNull(),
    ...timestamps(),
  },
  (t) => [
    // FK compuesta con columna nullable: MATCH SIMPLE (default de
    // Postgres) no exige match cuando building_id es NULL -- exactamente
    // lo que hace falta para un aviso de toda la organización.
    foreignKey({
      columns: [t.buildingId, t.organizationId],
      foreignColumns: [buildings.id, buildings.organizationId],
    }).onDelete("restrict"),
    // Necesaria para que announcement_recipients referencie
    // announcements(id, organization_id) con FK compuesta.
    unique("announcements_id_organization_id_unique").on(
      t.id,
      t.organizationId,
    ),
    // "Avisos de un edificio ordenados por fecha".
    index("announcements_building_id_created_at_idx").on(
      t.buildingId,
      t.createdAt,
    ),
    denyAnonAuthenticated(),
  ],
).enableRLS();
