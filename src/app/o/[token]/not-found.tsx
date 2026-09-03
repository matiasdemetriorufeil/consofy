// Cubre TRES casos con el mismo mensaje, a propósito (ver page.tsx): token
// mal formado, token que nunca existió, y token de OTRO tipo (ej. el
// public_token de un edificio pasado por error a esta ruta de
// organización). Mismo criterio de ambigüedad que src/app/r/[token]/
// not-found.tsx y src/app/s/[token]/not-found.tsx: nada distingue "nunca
// existió" de "no tenés acceso" para quien mira la pantalla.
//
// Sin botón ni link -- igual que /r/[token] (vecino sin sesión, sin ningún
// "adentro" al que volver): un link a "/" lo llevaría a la landing de
// administradores, que no le sirve. El único paso útil es el que ya sugiere
// el texto: pedirle el link correcto a su administración.
export default function OrganizationBuildingsNotFound() {
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
