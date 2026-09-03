"use client";

import { Download } from "lucide-react";

import { CopyButton } from "@/components/copy-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function PublicLinkPanel({
  buildingId,
  active,
  publicUrl,
  whatsappMessage,
  qrPreviewSrc,
}: {
  buildingId: string;
  active: boolean;
  publicUrl: string;
  whatsappMessage: string;
  qrPreviewSrc: string;
}) {
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {!active && (
        <Alert>
          <AlertTitle>Este edificio está inactivo</AlertTitle>
          <AlertDescription>
            El enlace y el QR siguen siendo válidos, pero el formulario público
            todavía no va a aceptar reclamos nuevos mientras el edificio esté
            inactivo. Reactivalo desde &quot;Editar edificio&quot; cuando
            quieras volver a recibirlos.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Enlace público</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-ink-muted text-sm">
            Compartí este enlace con los vecinos para que carguen sus reclamos
            sin necesidad de registrarse.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              readOnly
              value={publicUrl}
              onFocus={(event) => event.currentTarget.select()}
              className="font-mono"
              aria-label="Enlace público del edificio"
            />
            <CopyButton text={publicUrl} label="Copiar enlace" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Código QR</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-3">
          <p className="text-ink-muted text-sm">
            Imprimilo y pegalo en el hall o el ascensor para que los vecinos lo
            escaneen desde el celular.
          </p>
          <div className="border-border rounded-lg border bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL generada en el servidor, no una imagen optimizable por next/image */}
            <img
              src={qrPreviewSrc}
              alt={`Código QR del enlace público: ${publicUrl}`}
              width={200}
              height={200}
            />
          </div>
          <Button asChild variant="outline">
            <a href={`/panel/buildings/${buildingId}/public-link/qr`} download>
              <Download aria-hidden="true" />
              Descargar QR (PNG)
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mensaje para WhatsApp Business</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-ink-muted text-sm">
            Pegalo como respuesta automática de tu WhatsApp Business, así
            cualquier vecino que te escriba recibe el enlace al toque, sin que
            tengas que contestar vos.
          </p>
          <p className="border-border bg-canvas rounded-lg border p-3 text-sm whitespace-pre-wrap">
            {whatsappMessage}
          </p>
          <div>
            <CopyButton text={whatsappMessage} label="Copiar mensaje" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
