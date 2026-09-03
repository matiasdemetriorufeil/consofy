"use client";

import { CopyButton } from "@/components/copy-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

// Paso 17.2 -- el enlace de /o/[token] (paso 17.1) mostrado dentro del panel
// autenticado, para que la administradora lo copie y lo cargue como mensaje
// de bienvenida en su WhatsApp Business (eso lo hace ella a mano, fuera del
// sistema). Es un enlace de TODA la organización, no de un edificio puntual
// -- por eso vive arriba del listado de Edificios y no en la pestaña de
// enlace público de un edificio (paso 4.6, PublicLinkPanel).
//
// Reusa el MISMO patrón de esa pantalla para "mostrar un valor y copiarlo":
// un Input de solo lectura + CopyButton (extraído a
// src/components/copy-button.tsx en este paso). La URL llega ya armada por
// getOrganizationPublicUrl -- este componente no construye ninguna URL.
export function OrganizationPublicLinkCard({
  publicUrl,
}: {
  publicUrl: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Enlace para toda la administración</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-ink-muted text-sm">
          Cuando un vecino te escribe primero por WhatsApp y no sabés de qué
          edificio es, pasale este enlace: le muestra la lista de tus edificios
          para que elija el suyo y cargue el reclamo. Podés dejarlo como mensaje
          de bienvenida en tu WhatsApp Business.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            readOnly
            value={publicUrl}
            onFocus={(event) => event.currentTarget.select()}
            className="font-mono"
            aria-label="Enlace de la administración para que el vecino elija su edificio"
          />
          <CopyButton text={publicUrl} label="Copiar enlace" />
        </div>
      </CardContent>
    </Card>
  );
}
