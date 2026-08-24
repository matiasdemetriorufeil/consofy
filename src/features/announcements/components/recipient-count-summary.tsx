// Resumen de destinatarios (con/sin teléfono) -- extraído en el paso 8.5,
// segundo consumidor real de este mismo texto (el primero fue la vista
// previa, paso 8.4, con este mismo par de frases pluralizadas armadas
// inline en preview/page.tsx). Componente puro sin "use client": se puede
// renderizar directo desde cualquier Server Component. Preview NO se tocó
// para usarlo -- ya está verificado y funcionando desde el 8.4, y este
// paso no pide tocar esa pantalla; extraer esto ahora evita reimplementar
// la MISMA pluralización una tercera vez acá, que es lo que pide el
// enunciado ("reusar... en vez de reimplementarlo").
export function RecipientCountSummary({
  withPhone,
  withoutPhone,
}: {
  withPhone: number;
  withoutPhone: number;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {withPhone > 0 && (
        <p className="text-ink font-medium">
          {withPhone} {withPhone === 1 ? "destinatario" : "destinatarios"} van a
          recibir este aviso.
        </p>
      )}
      {withoutPhone > 0 && (
        <p className="text-ink-muted text-xs">
          {withoutPhone}{" "}
          {withoutPhone === 1
            ? "persona más califica"
            : "personas más califican"}{" "}
          por este segmento, pero no {withoutPhone === 1 ? "tiene" : "tienen"}{" "}
          teléfono cargado.
        </p>
      )}
    </div>
  );
}
