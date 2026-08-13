const PANEL_PREFIX = "/panel";

// Sin "server-only": lo importan tanto src/proxy.ts (Edge, no puede tirar
// de db/drizzle) como el código de servidor normal de login -- una
// utilidad chica sin dependencias, pensada para vivir en los dos mundos.
//
// Único chequeo necesario para evitar un open redirect: que el valor
// arranque exactamente con "/panel" (una sola barra, sin protocolo). Un
// string así nunca puede ser interpretado por el navegador como una URL
// de otro origen -- ni un esquema completo ("https://evil.com", que no
// arranca con "/") ni un protocol-relative ("//evil.com", cuyo segundo
// carácter es "/" y no "p") pasan el chequeo. No hace falta parsear la
// URL ni mantener una allowlist de hosts: el prefijo exacto ya lo
// garantiza.
export function sanitizeNextPath(value: string | null | undefined): string {
  if (value && value.startsWith(PANEL_PREFIX)) {
    return value;
  }
  return PANEL_PREFIX;
}
