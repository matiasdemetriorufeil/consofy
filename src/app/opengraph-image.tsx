import { ImageResponse } from "next/og";

// Card de Open Graph de la landing (Etapa 16, paso 16.4 -- decisión del
// arquitecto: Opción 1, generado con next/og, sin subir ningún asset a
// mano). Convención de Next: este archivo en `src/app/` produce el
// `og:image` de `/` (y lo heredan las rutas hijas que no definan el suyo
// -- inofensivo: `/panel/**` está detrás de login y bloqueado en robots).
//
// Colores = los mismos tokens del 16.2 (`globals.css` > `.landing-theme`).
// Satori (el motor de next/og) NO resuelve `var(--...)`, así que van los
// hex literales -- son los MISMOS valores, no inventados:
//   --landing-hero-bg  #eaf1ff   (fondo)
//   --landing-text     #132a53   (wordmark + headline)
//   --landing-text-muted #495671 (tagline)
//   --landing-accent   #2563eb   (barra de acento)
//
// Tipografía: se usa la sans por defecto de Satori (no se empaqueta ningún
// .ttf). Para renderizarlo en Archivo -- la tipográfica de títulos del
// 16.2 -- haría falta bundlear el archivo de la fuente; queda como
// follow-up chico si se quiere, no cambia la estructura de este card.

export const alt =
  "Consofy -- gestión de reclamos para administraciones de consorcios";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const HERO_BG = "#eaf1ff";
const TEXT = "#132a53";
const TEXT_MUTED = "#495671";
const ACCENT = "#2563eb";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        backgroundColor: HERO_BG,
      }}
    >
      {/* Barra de acento a la izquierda (--landing-accent) */}
      <div style={{ display: "flex", width: 16, backgroundColor: ACCENT }} />

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px 96px",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 40,
            fontWeight: 700,
            color: TEXT,
            letterSpacing: -0.5,
          }}
        >
          Consofy
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 28,
            maxWidth: 960,
            fontSize: 66,
            fontWeight: 700,
            lineHeight: 1.12,
            letterSpacing: -1.5,
            color: TEXT,
          }}
        >
          Los reclamos de tu edificio, en orden y en un solo lugar.
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 32,
            maxWidth: 860,
            fontSize: 30,
            lineHeight: 1.4,
            color: TEXT_MUTED,
          }}
        >
          Gestión de consorcios para administradores.
        </div>
      </div>
    </div>,
    { ...size },
  );
}
