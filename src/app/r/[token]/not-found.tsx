// Cubre TRES casos con el mismo mensaje, a propósito (ver page.tsx):
// token mal formado, token que nunca existió, y edificio dado de baja.
// Sin botón ni link -- a diferencia del not-found.tsx del panel (que
// ofrece "volver a edificios"), acá no hay ningún "adentro" al que mandar
// a un vecino: no tiene sesión, no conoce el resto de la app, y un link a
// "/" lo llevaría a una pantalla de administrador que no le sirve de nada.
// El único paso que le sirve es el que ya sugiere el texto: conseguir el
// link correcto de su administración.
export default function PublicBuildingNotFound() {
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-2 px-4 text-center">
      <h1 className="text-ink font-display text-xl font-semibold">
        No encontramos este enlace
      </h1>
      <p className="text-ink-muted text-base">
        Puede que esté mal escrito o que ya no esté disponible. Si lo recibiste
        de tu administración, pedile que te lo pase de nuevo.
      </p>
    </div>
  );
}
