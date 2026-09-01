import type { NextConfig } from "next";

// Headers de seguridad -- set mínimo aplicado en el paso 12.3 (auditoría),
// a TODAS las rutas. Ver CLAUDE.md > Auditoría de seguridad (paso 12.3)
// para el análisis completo, incluido POR QUÉ el resto (CSP, HSTS,
// Permissions-Policy, poweredByHeader) queda deferido a la Etapa 15
// (deploy) a propósito -- son decisiones de diseño reales (inventariar
// cada fuente de script/style/connect para la CSP, elegir max-age/preload/
// includeSubDomains para HSTS), no algo que se resuelva sin contexto.
const securityHeaders = [
  // Clickjacking: nadie tiene un motivo legítimo para enmarcar ninguna
  // pantalla de esta app. El panel autenticado tiene controles que cambian
  // estado real (estado de un reclamo, baja de un edificio, visibilidad de
  // un documento hacia los vecinos); las rutas públicas /r/[token] y
  // /s/[token] tienen botones que escriben (enviar reclamo, agregar
  // info/fotos del vecino). DENY, no SAMEORIGIN: la app tampoco se enmarca
  // a sí misma.
  { key: "X-Frame-Options", value: "DENY" },
  // MIME-sniffing: impide que un navegador reinterprete una respuesta como
  // un tipo distinto del declarado (defensa en profundidad barata).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Las URLs públicas llevan tokens secretos en el path (/r/<uuid>,
  // /s/<attachments_token>). Hoy esas páginas no linkean a terceros, pero
  // esta policy es la red de seguridad para que un futuro link saliente no
  // filtre el token entero en el header Referer.
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
