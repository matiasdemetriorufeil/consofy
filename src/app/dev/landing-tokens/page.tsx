// Ruta de desarrollo (paso 16.2): verificación visual de los tokens de la
// landing (`--landing-*`, definidos en globals.css bajo `.landing-theme`).
// No es una pantalla de negocio -- eliminar junto con /dev/styleguide
// antes de producción. /dev/* ya está bloqueado en prod por
// src/app/dev/layout.tsx.
//
// Sirve para dos cosas:
//   1. Ver que los tokens renderizan (colores, escala tipográfica).
//   2. Confirmar el acotamiento: TODO lo de esta página vive dentro de un
//      <div className="landing-theme">. Abrir /panel o /r/[token] (que no
//      llevan esa clase) tiene que verse EXACTAMENTE igual que antes.

const SWATCHES: { name: string; varName: string }[] = [
  { name: "--landing-bg", varName: "--landing-bg" },
  { name: "--landing-bg-subtle", varName: "--landing-bg-subtle" },
  { name: "--landing-surface", varName: "--landing-surface" },
  { name: "--landing-border", varName: "--landing-border" },
  { name: "--landing-hero-bg", varName: "--landing-hero-bg" },
  { name: "--landing-text", varName: "--landing-text" },
  { name: "--landing-text-muted", varName: "--landing-text-muted" },
  { name: "--landing-accent", varName: "--landing-accent" },
  { name: "--landing-accent-strong", varName: "--landing-accent-strong" },
  { name: "--landing-accent-fg", varName: "--landing-accent-fg" },
];

const CONTRAST_PAIRS: {
  label: string;
  fg: string;
  bg: string;
  ratio: string;
}[] = [
  {
    label: "texto sobre fondo",
    fg: "--landing-text",
    bg: "--landing-bg",
    ratio: "14.1:1",
  },
  {
    label: "texto sobre hero",
    fg: "--landing-text",
    bg: "--landing-hero-bg",
    ratio: "12.5:1",
  },
  {
    label: "texto sobre gris",
    fg: "--landing-text",
    bg: "--landing-bg-subtle",
    ratio: "13.2:1",
  },
  {
    label: "texto atenuado sobre fondo",
    fg: "--landing-text-muted",
    bg: "--landing-bg",
    ratio: "7.4:1",
  },
  {
    label: "texto atenuado sobre hero",
    fg: "--landing-text-muted",
    bg: "--landing-hero-bg",
    ratio: "6.5:1",
  },
  {
    label: "texto del CTA sobre azul",
    fg: "--landing-accent-fg",
    bg: "--landing-accent",
    ratio: "5.2:1",
  },
  {
    label: "link (azul fuerte) sobre fondo",
    fg: "--landing-accent-strong",
    bg: "--landing-bg",
    ratio: "6.7:1",
  },
  {
    label: "link (azul fuerte) sobre hero",
    fg: "--landing-accent-strong",
    bg: "--landing-hero-bg",
    ratio: "5.9:1",
  },
];

const TYPE_SPECIMENS: {
  token: string;
  sizeVar: string;
  fontVar: string;
  weightVar: string;
  leadingVar: string;
  tracking?: string;
  sample: string;
}[] = [
  {
    token: "--landing-text-hero",
    sizeVar: "--landing-text-hero",
    fontVar: "--landing-font-heading",
    weightVar: "--landing-weight-heading",
    leadingVar: "--landing-leading-tight",
    tracking: "--landing-tracking-tight",
    sample: "Los reclamos de tu edificio, en orden y en un solo lugar.",
  },
  {
    token: "--landing-text-h2",
    sizeVar: "--landing-text-h2",
    fontVar: "--landing-font-heading",
    weightVar: "--landing-weight-strong",
    leadingVar: "--landing-leading-snug",
    tracking: "--landing-tracking-tight",
    sample: "Administrar un consorcio no debería vivir en un chat de WhatsApp.",
  },
  {
    token: "--landing-text-h3",
    sizeVar: "--landing-text-h3",
    fontVar: "--landing-font-heading",
    weightVar: "--landing-weight-strong",
    leadingVar: "--landing-leading-snug",
    sample: "Un link por edificio",
  },
  {
    token: "--landing-text-lead",
    sizeVar: "--landing-text-lead",
    fontVar: "--landing-font-body",
    weightVar: "--landing-weight-regular",
    leadingVar: "--landing-leading-normal",
    sample:
      "Consorfy le da a cada edificio un link para que los vecinos carguen sus reclamos, y a vos un panel donde ves todo.",
  },
  {
    token: "--landing-text-body",
    sizeVar: "--landing-text-body",
    fontVar: "--landing-font-body",
    weightVar: "--landing-weight-regular",
    leadingVar: "--landing-leading-normal",
    sample:
      "Bandeja con filtros y estados, asignación, notas internas y exportación. Consorfy marca posibles reclamos repetidos y te deja agruparlos.",
  },
  {
    token: "--landing-text-small",
    sizeVar: "--landing-text-small",
    fontVar: "--landing-font-body",
    weightVar: "--landing-weight-regular",
    leadingVar: "--landing-leading-normal",
    sample: "© 2026 Consorfy. Gestión de consorcios para administradores.",
  },
];

export default function LandingTokensPreviewPage() {
  return (
    <div className="landing-theme" style={{ minHeight: "100dvh" }}>
      {/* Hero de mentira: el único bloque con fondo azul */}
      <section
        style={{
          backgroundColor: "var(--landing-hero-bg)",
          padding: "4rem 1.5rem",
        }}
      >
        <div style={{ maxWidth: "48rem", margin: "0 auto" }}>
          <p
            style={{
              fontFamily: "var(--landing-font-body)",
              fontSize: "var(--landing-text-small)",
              fontWeight: "var(--landing-weight-strong)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--landing-accent-strong)",
              marginBottom: "0.75rem",
            }}
          >
            Consorfy
          </p>
          <h1
            style={{
              fontFamily: "var(--landing-font-heading)",
              fontSize: "var(--landing-text-hero)",
              fontWeight: "var(--landing-weight-heading)",
              lineHeight: "var(--landing-leading-tight)",
              letterSpacing: "var(--landing-tracking-tight)",
              color: "var(--landing-text)",
              margin: 0,
            }}
          >
            Los reclamos de tu edificio, en orden y en un solo lugar.
          </h1>
          <p
            style={{
              fontFamily: "var(--landing-font-body)",
              fontSize: "var(--landing-text-lead)",
              lineHeight: "var(--landing-leading-normal)",
              color: "var(--landing-text-muted)",
              marginTop: "1rem",
              marginBottom: "1.75rem",
              maxWidth: "40rem",
            }}
          >
            Consorfy le da a cada edificio un link para que los vecinos carguen
            sus reclamos, y a vos un panel donde ves todo, cambiás estados y no
            se te pierde nada.
          </p>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <a
              href="#"
              style={{
                display: "inline-flex",
                alignItems: "center",
                backgroundColor: "var(--landing-accent)",
                color: "var(--landing-accent-fg)",
                fontFamily: "var(--landing-font-body)",
                fontWeight: "var(--landing-weight-strong)",
                fontSize: "var(--landing-text-body)",
                padding: "0.75rem 1.25rem",
                borderRadius: "0.625rem",
                textDecoration: "none",
              }}
            >
              Solicitá una prueba gratuita
            </a>
            <a
              href="#"
              style={{
                display: "inline-flex",
                alignItems: "center",
                color: "var(--landing-accent-strong)",
                fontFamily: "var(--landing-font-body)",
                fontWeight: "var(--landing-weight-strong)",
                fontSize: "var(--landing-text-body)",
                padding: "0.75rem 1rem",
                textDecoration: "none",
              }}
            >
              Ingresar
            </a>
          </div>
        </div>
      </section>

      {/* Fuera del hero: fondo blanco / gris, azul solo como acento */}
      <section style={{ padding: "3rem 1.5rem" }}>
        <div
          style={{
            maxWidth: "60rem",
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            gap: "3rem",
          }}
        >
          <div>
            <h2
              style={{
                fontFamily: "var(--landing-font-heading)",
                fontSize: "var(--landing-text-h2)",
                fontWeight: "var(--landing-weight-strong)",
                lineHeight: "var(--landing-leading-snug)",
                letterSpacing: "var(--landing-tracking-tight)",
                color: "var(--landing-text)",
                marginTop: 0,
              }}
            >
              Swatches
            </h2>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: "0.75rem",
              }}
            >
              {SWATCHES.map((s) => (
                <li
                  key={s.name}
                  style={{
                    border: "1px solid var(--landing-border)",
                    borderRadius: "0.625rem",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "3.5rem",
                      backgroundColor: `var(${s.varName})`,
                    }}
                  />
                  <div
                    style={{
                      padding: "0.5rem 0.75rem",
                      fontFamily: "var(--landing-font-body)",
                      fontSize: "var(--landing-text-small)",
                      color: "var(--landing-text-muted)",
                    }}
                  >
                    {s.name}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2
              style={{
                fontFamily: "var(--landing-font-heading)",
                fontSize: "var(--landing-text-h2)",
                fontWeight: "var(--landing-weight-strong)",
                lineHeight: "var(--landing-leading-snug)",
                letterSpacing: "var(--landing-tracking-tight)",
                color: "var(--landing-text)",
                marginTop: 0,
              }}
            >
              Contraste (texto sobre fondo)
            </h2>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              {CONTRAST_PAIRS.map((p) => (
                <li
                  key={p.label}
                  style={{
                    backgroundColor: `var(${p.bg})`,
                    color: `var(${p.fg})`,
                    border: "1px solid var(--landing-border)",
                    borderRadius: "0.5rem",
                    padding: "0.75rem 1rem",
                    fontFamily: "var(--landing-font-body)",
                    fontSize: "var(--landing-text-body)",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "1rem",
                  }}
                >
                  <span>
                    {p.label}: el ascensor de la torre norte no responde
                  </span>
                  <span
                    style={{
                      fontWeight: "var(--landing-weight-strong)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.ratio}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2
              style={{
                fontFamily: "var(--landing-font-heading)",
                fontSize: "var(--landing-text-h2)",
                fontWeight: "var(--landing-weight-strong)",
                lineHeight: "var(--landing-leading-snug)",
                letterSpacing: "var(--landing-tracking-tight)",
                color: "var(--landing-text)",
                marginTop: 0,
              }}
            >
              Escala tipográfica
            </h2>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "1.5rem",
              }}
            >
              {TYPE_SPECIMENS.map((t) => (
                <div key={t.token}>
                  <p
                    style={{
                      fontFamily: "var(--landing-font-body)",
                      fontSize: "var(--landing-text-small)",
                      color: "var(--landing-text-muted)",
                      margin: "0 0 0.25rem",
                    }}
                  >
                    {t.token}
                  </p>
                  <p
                    style={{
                      fontFamily: `var(${t.fontVar})`,
                      fontSize: `var(${t.sizeVar})`,
                      fontWeight: `var(${t.weightVar})`,
                      lineHeight: `var(${t.leadingVar})`,
                      letterSpacing: t.tracking
                        ? `var(${t.tracking})`
                        : undefined,
                      color: "var(--landing-text)",
                      margin: 0,
                    }}
                  >
                    {t.sample}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              backgroundColor: "var(--landing-bg-subtle)",
              border: "1px solid var(--landing-border)",
              borderRadius: "0.625rem",
              padding: "1.5rem",
            }}
          >
            <h3
              style={{
                fontFamily: "var(--landing-font-heading)",
                fontSize: "var(--landing-text-h3)",
                fontWeight: "var(--landing-weight-strong)",
                lineHeight: "var(--landing-leading-snug)",
                color: "var(--landing-text)",
                marginTop: 0,
              }}
            >
              Banda gris (fuera del hero)
            </h3>
            <p
              style={{
                fontFamily: "var(--landing-font-body)",
                fontSize: "var(--landing-text-body)",
                lineHeight: "var(--landing-leading-normal)",
                color: "var(--landing-text-muted)",
                margin: 0,
              }}
            >
              El azul queda como acento:{" "}
              <a
                href="#"
                style={{
                  color: "var(--landing-accent-strong)",
                  fontWeight: "var(--landing-weight-strong)",
                }}
              >
                un link
              </a>
              , un borde, un ícono -- nunca el fondo general.
            </p>
          </div>
        </div>
      </section>

      <footer
        style={{
          borderTop: "1px solid var(--landing-border)",
          padding: "2rem 1.5rem",
        }}
      >
        <div
          style={{
            maxWidth: "60rem",
            margin: "0 auto",
            fontFamily: "var(--landing-font-body)",
            fontSize: "var(--landing-text-small)",
            color: "var(--landing-text-muted)",
          }}
        >
          © 2026 Consorfy. Gestión de consorcios para administradores.
        </div>
      </footer>
    </div>
  );
}
