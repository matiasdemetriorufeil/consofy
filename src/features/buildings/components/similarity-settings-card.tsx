"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { updateSimilaritySettingsAction } from "../actions";

// Configuración de la heurística de duplicados (paso 7.6) -- único Client
// Component nuevo de esta pantalla, mismo motivo que TicketActionsPanel/
// ResolveIncidentButton: necesita estado local de los dos inputs y su
// propio useTransition. Se monta en el layout de /panel/buildings/[id]
// (visible en TODAS las pestañas, no en una sola) porque es una
// configuración del EDIFICIO en sí, no de un tab puntual (Reclamos,
// Documentos, etc.) -- ver el reporte del paso para por qué no se agregó
// una pestaña "Configuración" nueva solo para esto.
//
// Muestra los valores ACTUALES al cargar (props, no un formulario vacío)
// -- pedido explícito del enunciado.
export function SimilaritySettingsCard({
  buildingId,
  windowHours: initialWindowHours,
  threshold: initialThreshold,
}: {
  buildingId: string;
  windowHours: number;
  threshold: number;
}) {
  const router = useRouter();
  const [windowHours, setWindowHours] = useState(String(initialWindowHours));
  const [threshold, setThreshold] = useState(String(initialThreshold));
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    const parsedWindowHours = Number(windowHours);
    const parsedThreshold = Number(threshold);

    startTransition(async () => {
      const result = await updateSimilaritySettingsAction({
        buildingId,
        windowHours: parsedWindowHours,
        threshold: parsedThreshold,
      });
      if (result.ok) {
        toast.success("Configuración de detección de duplicados guardada.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Detección de posibles duplicados</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <p className="text-ink-muted text-sm">
          Controla cómo el sistema sugiere que dos reclamos de este edificio
          podrían ser el mismo problema. Un cambio acá no afecta a los
          candidatos que ya se detectaron -- solo a los reclamos que se carguen
          de ahora en más.
        </p>

        <div className="flex flex-col gap-4 sm:flex-row">
          <Field className="flex-1">
            <FieldLabel htmlFor="similarity-window-hours">
              Ventana de tiempo (horas)
            </FieldLabel>
            <Input
              id="similarity-window-hours"
              type="number"
              min={1}
              max={720}
              step={1}
              value={windowHours}
              disabled={isPending}
              onChange={(e) => setWindowHours(e.target.value)}
            />
            <p className="text-ink-muted text-xs">
              Solo compara reclamos reportados dentro de esta cantidad de horas
              entre sí. Entre 1 y 720 (30 días).
            </p>
          </Field>

          <Field className="flex-1">
            <FieldLabel htmlFor="similarity-threshold">
              Umbral de similitud
            </FieldLabel>
            <Input
              id="similarity-threshold"
              type="number"
              min={0.01}
              max={1}
              step={0.01}
              value={threshold}
              disabled={isPending}
              onChange={(e) => setThreshold(e.target.value)}
            />
            <p className="text-ink-muted text-xs">
              Mayor a 0 y hasta 1. Más bajo detecta más parecidos (con más
              falsos positivos); más alto, solo textos casi idénticos.
            </p>
          </Field>
        </div>

        <Button
          type="button"
          className="self-start"
          disabled={isPending}
          onClick={handleSave}
        >
          {isPending ? "Guardando…" : "Guardar configuración"}
        </Button>
      </CardContent>
    </Card>
  );
}
