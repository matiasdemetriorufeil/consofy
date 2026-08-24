import type { PhoneIssue } from "@/lib/phone";

import type { ExcludedSegmentRecipient } from "../queries";

// Motivo específico por el que una persona no recibe el aviso -- paso 8.7,
// reemplaza el "no tiene teléfono cargado" genérico que trataba faltante e
// inválido igual. Sin "use client": es JSX puro, se importa igual desde un
// Server Component (preview, paso 8.4) que desde uno de cliente (el
// editor, paso 8.2, que lo pinta recién después de un fetch lazy) -- no
// hace falta duplicar el render en los dos lugares.
export const PHONE_ISSUE_LABEL: Record<PhoneIssue, string> = {
  missing: "Sin teléfono cargado",
  invalid_format: "Teléfono con formato inválido",
};

export function ExcludedRecipientsList({
  recipients,
}: {
  recipients: ExcludedSegmentRecipient[];
}) {
  return (
    <ul className="flex flex-col gap-1.5">
      {recipients.map((recipient) => (
        <li
          key={recipient.id}
          className="border-border flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm"
        >
          <span className="flex flex-col">
            <span className="text-ink font-medium">{recipient.name}</span>
            <span className="text-ink-muted text-xs">
              {PHONE_ISSUE_LABEL[recipient.issue]}
              {recipient.issue === "invalid_format" &&
                recipient.phoneE164 &&
                ` (${recipient.phoneE164})`}
            </span>
          </span>
          {recipient.editHref ? (
            // target="_blank" a propósito, no una navegación afuera de
            // esta pantalla: el administrador puede tener un borrador o un
            // segmento a medio armar acá -- abrir la ficha en una pestaña
            // aparte corrige el teléfono sin arriesgar ese trabajo (ver
            // CLAUDE.md > Validación de teléfonos, paso 8.7).
            <a
              href={recipient.editHref}
              target="_blank"
              rel="noreferrer"
              className="text-ink-muted hover:text-ink text-xs underline underline-offset-2"
            >
              Corregir ficha
            </a>
          ) : (
            <span className="text-ink-muted text-xs">
              Sin ninguna unidad asignada -- no se puede editar desde acá
              todavía.
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
