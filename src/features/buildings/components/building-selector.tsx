"use client";

import { useTransition } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { setSelectedBuildingAction } from "../actions";
import type { ActiveBuildingOption } from "../queries";

// Sentinel solo de UI: Radix Select no admite value="" en un SelectItem.
// La cookie en sí nunca guarda este string -- "todos los edificios" se
// representa por la AUSENCIA de la cookie (ver CLAUDE.md > Selector de
// edificio activo). Acá se traduce en el borde, antes de llamar a la
// Server Action.
const ALL_BUILDINGS_VALUE = "all";

export function BuildingSelector({
  buildings,
  selectedBuildingId,
}: {
  buildings: ActiveBuildingOption[];
  selectedBuildingId: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  // Texto del trigger calculado a mano, no confiado al lookup interno de
  // Radix (Select.Value intenta resolver la etiqueta buscando qué
  // Select.Item coincide con el value, pero solo puede hacerlo si ese Item
  // ya se montó alguna vez en ESTE ciclo de vida del componente -- en la
  // carga inicial de una página, o después de un reload completo, todavía
  // no se abrió el dropdown ni una vez, así que ese lookup no tiene nada
  // que encontrar y el trigger queda en blanco aunque el value sea
  // correcto. Encontrado con una prueba real: funcionaba después de
  // navegar entre secciones (el componente seguía montado de la
  // navegación anterior, con el dropdown ya abierto una vez) pero no
  // después de un F5. Acá no hace falta ese lookup -- ya tenemos la lista
  // de edificios con sus nombres como prop.
  const selectedBuilding = buildings.find((b) => b.id === selectedBuildingId);
  const triggerLabel = selectedBuilding?.name ?? "Todos los edificios";

  return (
    <Select
      value={selectedBuildingId ?? ALL_BUILDINGS_VALUE}
      disabled={isPending}
      onValueChange={(value) => {
        const buildingId = value === ALL_BUILDINGS_VALUE ? null : value;
        // Server Action llamada directo (sin form). El callback tiene que
        // ser async y devolver la promesa (no solo dispararla con `void`
        // adentro de uno sync): así es como React 19 sabe que la
        // transición sigue pendiente hasta que la Server Action termina
        // -- si no, isPending vuelve a false apenas termina este callback
        // sync, antes de que la cookie se haya escrito de verdad.
        startTransition(async () => {
          await setSelectedBuildingAction(buildingId);
        });
      }}
    >
      <SelectTrigger aria-label="Edificio" className="w-44">
        <SelectValue placeholder="Todos los edificios">
          {triggerLabel}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_BUILDINGS_VALUE}>Todos los edificios</SelectItem>
        {buildings.map((building) => (
          <SelectItem key={building.id} value={building.id}>
            {building.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
