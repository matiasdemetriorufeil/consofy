// Plantillas predefinidas para el editor de comunicados (paso 8.3).
//
// Hardcodeadas en código, no en una tabla -- decisión de este paso.
// Verificado antes de escribir nada: la etapa 2.5 no dejó ninguna tabla ni
// columna pensada para "plantillas de aviso" (a diferencia de
// `announcements`/`announcement_recipients`, que sí venían completos desde
// esa etapa -- ver CLAUDE.md > Constructor de segmentos, paso 8.2). El
// enunciado de este paso además prohíbe explícitamente agregar una pantalla
// de administración de plantillas -- sin esa pantalla, no hay quién las
// edite desde el panel, así que una tabla nueva solo agregaría una migración
// y un CRUD que nadie va a usar todavía. Si en algún paso futuro se pide
// poder crear/editar plantillas desde el panel, ESE es el momento de
// convertir esto en una tabla real.
//
// DOS categorías de variable dentro de un mismo `bodyTemplate`, distinguidas
// por CÓDIGO (la lista `variables` de cada plantilla), no por una sintaxis de
// placeholder distinta -- las dos usan la misma forma `{{clave}}`:
//   - "De comunicado" (`variables` de abajo): una editorial, igual para todo
//     el segmento (fecha, horario, motivo...). Se completan en el editor, ANTES
//     de guardar -- `applyTemplateVariables()` las sustituye acá mismo.
//   - "Por destinatario" (nombre, unidad...): cualquier `{{token}}` del
//     `bodyTemplate` que NO esté en `variables` queda SIN sustituir a
//     propósito -- ese es justo el contrato que el paso 8.5 necesita: lee
//     `announcements.body` ya guardado (con las variables de comunicado
//     resueltas) y resuelve lo que quede con `{{...}}` contra los datos
//     reales de cada persona del segmento. Ver `extractPlaceholderTokens()`
//     más abajo, pensada para que el 8.5 la use sin tener que reinventar el
//     parseo.
export type AnnouncementTemplateVariable = {
  key: string;
  label: string;
  placeholder?: string;
};

export type AnnouncementTemplate = {
  id: string;
  name: string;
  variables: AnnouncementTemplateVariable[];
  bodyTemplate: string;
};

export const ANNOUNCEMENT_TEMPLATES: AnnouncementTemplate[] = [
  {
    id: "corte-de-agua",
    name: "Corte de agua",
    variables: [
      { key: "fecha", label: "Fecha", placeholder: "15/09/2026" },
      { key: "horarioDesde", label: "Horario desde", placeholder: "09:00" },
      { key: "horarioHasta", label: "Horario hasta", placeholder: "13:00" },
      {
        key: "motivo",
        label: "Motivo",
        placeholder: "trabajos de mantenimiento en la cisterna",
      },
    ],
    bodyTemplate:
      "Hola {{nombre}},\n\n" +
      "Te avisamos que el {{fecha}} vamos a cortar el suministro de agua del edificio de {{horarioDesde}} a {{horarioHasta}}hs, por {{motivo}}.\n\n" +
      "Tu unidad, {{unidad}}, va a estar sin servicio durante ese horario -- te sugerimos juntar agua con anticipación si lo necesitás.\n\n" +
      "Gracias por la comprensión.",
  },
  {
    id: "mantenimiento",
    name: "Mantenimiento",
    variables: [
      { key: "fecha", label: "Fecha", placeholder: "20/09/2026" },
      { key: "horario", label: "Horario", placeholder: "08:00" },
      {
        key: "tarea",
        label: "Tarea a realizar",
        placeholder: "mantenimiento del ascensor",
      },
    ],
    bodyTemplate:
      "Hola {{nombre}},\n\n" +
      "Te avisamos que el {{fecha}} a partir de las {{horario}}hs vamos a hacer {{tarea}}. Puede haber ruido o acceso restringido a algunos sectores comunes durante ese horario.\n\n" +
      "Tu unidad, {{unidad}}, no necesita hacer nada en particular.\n\n" +
      "Gracias por la comprensión.",
  },
  {
    id: "fumigacion",
    name: "Fumigación",
    variables: [
      { key: "fecha", label: "Fecha", placeholder: "22/09/2026" },
      { key: "horario", label: "Horario", placeholder: "10:00" },
      {
        key: "area",
        label: "Área a fumigar",
        placeholder: "las cocheras y los espacios comunes",
      },
    ],
    bodyTemplate:
      "Hola {{nombre}},\n\n" +
      "El {{fecha}} a las {{horario}}hs vamos a fumigar {{area}}. Te pedimos que durante ese horario evites circular por esos sectores.\n\n" +
      "Tu unidad, {{unidad}}, no necesita desocuparse.\n\n" +
      "Gracias por la comprensión.",
  },
  {
    id: "asamblea",
    name: "Asamblea",
    variables: [
      { key: "fecha", label: "Fecha", placeholder: "30/09/2026" },
      { key: "horario", label: "Horario", placeholder: "19:00" },
      { key: "lugar", label: "Lugar", placeholder: "el SUM del edificio" },
      {
        key: "temario",
        label: "Temario",
        placeholder: "la aprobación del presupuesto anual",
      },
    ],
    bodyTemplate:
      "Hola {{nombre}},\n\n" +
      "Te convocamos a la asamblea de propietarios del {{fecha}} a las {{horario}}hs, en {{lugar}}. El temario incluye: {{temario}}.\n\n" +
      "Tu presencia como responsable de la unidad {{unidad}} es importante -- si no podés asistir, recordá que podés dar poder a otra persona.\n\n" +
      "Te esperamos.",
  },
];

export function getAnnouncementTemplate(
  id: string,
): AnnouncementTemplate | undefined {
  return ANNOUNCEMENT_TEMPLATES.find((t) => t.id === id);
}

// Sustituye SOLO las variables de comunicado (`values`) -- cualquier
// `{{token}}` del template cuya clave no esté en `values` queda intacto,
// sea porque es un placeholder por destinatario (nombre/unidad) o porque la
// variable todavía no se completó (defensivo: el editor no debería llegar a
// guardar con variables vacías, ver la validación en
// AnnouncementSegmentForm, pero esta función no asume eso).
export function applyTemplateVariables(
  bodyTemplate: string,
  values: Record<string, string>,
): string {
  return bodyTemplate.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = values[key]?.trim();
    return value ? value : match;
  });
}

// Placeholders por destinatario que las CUATRO plantillas predefinidas usan
// como mínimo (pedido explícito del enunciado) -- documentado acá para que
// el paso 8.5 sepa qué esperar, no una lista cerrada: en modo "sin
// plantilla" el administrador puede tipear cualquier `{{token}}` a mano.
export const MIN_RECIPIENT_PLACEHOLDERS = ["nombre", "unidad"] as const;

// Extrae los placeholders que quedan SIN resolver en un cuerpo ya guardado
// (después de aplicar `applyTemplateVariables` en el paso 8.3) -- son, por
// construcción, los placeholders POR DESTINATARIO que hay que resolver
// contra los datos reales de cada persona del segmento. Primer consumidor
// real: la vista previa del paso 8.4 (para avisar si el cuerpo usa un
// placeholder que no es "nombre" ni "unidad" y por lo tanto no se va a
// poder resolver, ver el comentario de resolveRecipientPlaceholders más
// abajo). Formato: `{{clave}}`, `clave` = uno o más caracteres de \w
// (letras/números/guión bajo), sin espacios adentro de las llaves.
export function extractPlaceholderTokens(body: string): string[] {
  const matches = body.matchAll(/\{\{(\w+)\}\}/g);
  const tokens = [...matches]
    .map((m) => m[1])
    .filter((token): token is string => token !== undefined);
  return [...new Set(tokens)];
}

// Valores por destinatario reconocidos hoy (paso 8.4) -- `nombre` sale de
// `people.first_name`/`last_name` (NOT NULL/nullable respectivamente, ver
// src/db/schema/people.ts), así que SIEMPRE es un string no vacío para
// cualquier persona real. `unidad` puede ser `null`: una persona agregada a
// mano sin ninguna ocupación vigente (o sin ocupación dentro del edificio
// del aviso) no tiene ninguna unidad que mostrar -- ver el comentario de
// getSegmentRecipientsForPreview (queries.ts) para cómo se resuelve esa
// lista.
export type RecipientPlaceholderValues = {
  nombre: string;
  unidad: string | null;
};

// Texto visible cuando un placeholder RECONOCIDO no se puede resolver para
// una persona puntual -- nunca se deja el placeholder crudo (`{{unidad}}`)
// ni un string vacío que parezca un dato faltante por error. Decisión del
// paso 8.4, de las tres opciones que planteaba el enunciado (texto vacío,
// placeholder sin resolver visible, excluir de la vista previa): un texto
// explícito es lo único de las tres que es simultáneamente honesto (no
// pretende que la persona tiene una unidad que no tiene) y no rompe la
// lectura del mensaje completo -- vacío se leería como un espacio en blanco
// sin explicación, el placeholder crudo expondría una interioridad de
// implementación al usuario del panel, y excluir a la persona escondería
// que ese destinatario real existe y va a recibir un mensaje con este
// texto.
export const UNRESOLVED_PLACEHOLDER_FALLBACK: Record<string, string> = {
  unidad: "(sin unidad asignada)",
};

// Resuelve, en un cuerpo YA con las variables de comunicado sustituidas
// (paso 8.3), los placeholders POR DESTINATARIO reconocidos -- pensada para
// que el paso 8.5 (envío real) reuse esta MISMA función, no solo la vista
// previa del 8.4: es la única función de este módulo que conoce el shape
// `RecipientPlaceholderValues`, así que cualquier cambio futuro al set de
// placeholders reconocidos se hace en un solo lugar.
//
// Cualquier `{{token}}` que NO sea "nombre" ni "unidad" queda SIN TOCAR --
// pasa esto en modo "sin plantilla" (paso 8.3), donde el administrador
// puede tipear cualquier token a mano (ej. `{{telefono}}`, no soportado
// hoy). Dejarlo visible tal cual (en vez de vaciarlo o tirar un error) es
// la forma más honesta de mostrar "esto no se va a resolver" -- el propio
// texto crudo es la señal, no algo que haya que adivinar.
export function resolveRecipientPlaceholders(
  body: string,
  values: RecipientPlaceholderValues,
): string {
  return body.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    // Comparaciones directas, no una tabla genérica indexada por `key` --
    // con solo dos claves reconocidas, es más simple y evita que TypeScript
    // tenga que inferir un tipo `string | undefined` para un acceso
    // dinámico (`noUncheckedIndexedAccess`) que acá nunca puede pasar.
    if (key === "nombre") {
      return values.nombre;
    }
    if (key === "unidad") {
      return values.unidad === null
        ? (UNRESOLVED_PLACEHOLDER_FALLBACK.unidad ?? match)
        : values.unidad;
    }
    return match;
  });
}
