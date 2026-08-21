import Papa from "papaparse";

import { formatExactDate } from "@/lib/format-date";

import { PRIORITY_LABEL } from "./components/priority-badge";
import { STATUS_LABEL } from "./components/status-badge";
import type { TicketExportRow } from "./queries";
import { toBadgePriority, toBadgeStatus } from "./status-mapping";

// Encabezados en español, mismo vocabulario que el resto de la UI (paso
// 6.7) -- reusa PRIORITY_LABEL/STATUS_LABEL (paso 6.3/6.1) para los valores
// de cada fila, no una segunda copia de esos mapas.
const CSV_HEADERS = [
  "Código",
  "Edificio",
  "Unidad",
  "Categoría",
  "Prioridad",
  "Estado",
  "Responsable",
  "Fecha de reporte",
  "Fecha de resolución",
  "Vecino",
  "Teléfono",
  "Descripción",
] as const;

// Función pura -- toma las filas ya resueltas por getTicketsForExport() y
// arma el CSV completo (string), sin tocar la base ni el sistema de
// archivos. Mismo criterio que formatTicketMessage (paso 5.6): fácil de
// testear sin infraestructura de red/DB.
//
// Forma `{ fields, data }` de Papa.unparse (no array de objetos): con CERO
// filas, un array de objetos no tiene de dónde sacar las claves para el
// encabezado (Papa no puede inferirlas de un array vacío) -- pasando
// `fields` explícito, el CSV sale con SOLO el encabezado en ese caso, nunca
// vacío ni roto. `data` es un array de arrays (una fila = un array de
// valores en el mismo orden que `fields`), no de objetos -- evita que un
// nombre de columna mal tipeado en un lado quede silenciosamente
// desalineado del otro.
//
// Defensa contra CSV injection, SOLO en los campos de texto libre que un
// vecino/administrador tipea sin ninguna validación de formato (vecino,
// responsable, descripción): un valor que empieza con "=", "+", "-" o "@"
// se antepone con un `'` antes de exportar, para que Excel/LibreOffice no
// lo interprete como una fórmula al abrir el archivo. No estaba pedido
// explícitamente, pero es el mismo tipo de defensa en profundidad barata
// que ya aplica el resto del proyecto (ver CLAUDE.md > Reglas de
// seguridad) -- un vecino puede escribir cualquier cosa en la descripción
// de un reclamo público, sin validación de contenido.
//
// A mano, NO con `escapeFormulae` de Papa.unparse (que es una opción
// GLOBAL, sin forma de acotarla a columnas puntuales): encontrado
// probando este mismo paso -- con `escapeFormulae: true` a nivel de toda
// la tabla, el TELÉFONO (que siempre arranca con "+" en formato E.164,
// ver CLAUDE.md > Acceso a datos) también quedaba marcado como
// "fórmula" y salía con un `'` pegado adelante (`'+5491122334455`),
// aunque no es texto libre sino un formato validado por la base
// (`people_phone_e164_format`). Guardar el campo a mano, columna por
// columna, evita ensuciar Teléfono/Código/fechas -- que nunca los escribe
// un vecino de forma libre -- sin resignar la protección real.
const FORMULA_INJECTION_PREFIX = /^[=+\-@\t\r]/;

function guardAgainstFormulaInjection(value: string): string {
  return FORMULA_INJECTION_PREFIX.test(value) ? `'${value}` : value;
}

// Comas, comillas y saltos de línea dentro de un campo: Papa.unparse ya los
// escapa por default (encierra el campo entre comillas dobles y duplica las
// comillas internas) SIN necesitar `quotes: true` -- se verificó contra el
// código fuente de la librería (`needsQuotes` en papaparse.js), no se
// asumió.
export function buildTicketsExportCsv(
  rows: TicketExportRow[],
  timezone: string,
): string {
  const data = rows.map((row) => [
    row.publicCode,
    row.buildingName,
    row.unitLabel ?? "",
    row.categoryName,
    PRIORITY_LABEL[toBadgePriority(row.priority)],
    STATUS_LABEL[toBadgeStatus(row.status)],
    guardAgainstFormulaInjection(row.assignee ?? ""),
    formatExactDate(row.reportedAt, timezone),
    row.resolvedAt ? formatExactDate(row.resolvedAt, timezone) : "",
    guardAgainstFormulaInjection(row.neighborName ?? ""),
    row.neighborPhoneE164 ?? "",
    guardAgainstFormulaInjection(row.description),
  ]);

  const csv = Papa.unparse({ fields: [...CSV_HEADERS], data });

  // BOM UTF-8 (paso 6.7: Excel en Windows rompe tildes/ñ sin esto) --
  // Papa.BYTE_ORDER_MARK es la misma constante "﻿" que exporta la
  // librería, en vez de repetir el literal a mano.
  return Papa.BYTE_ORDER_MARK + csv;
}
