// Quita tildes/diacriticos para que "Cordoba" se pueda comparar como
// "cordoba" sin depender de que el diacritico este bien escrito -- extraida
// de buildings/building-schema.ts (paso 4.5) en cuanto aparecio el segundo
// consumidor (features/imports, para reconocer encabezados de CSV con o sin
// acentos), mismo criterio que src/lib/phone.ts. \p{Diacritic} (con la
// bandera unicode "u") es el idiomatico moderno para esto: normalize("NFD")
// separa la letra de su marca diacritica, \p{Diacritic} identifica esa
// marca sin tener que escribir a mano el rango de code points
// U+0300-U+036F (fragil de tipear/copiar en un archivo con caracteres
// multibyte, como paso en un intento anterior de este mismo archivo).
export function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}
