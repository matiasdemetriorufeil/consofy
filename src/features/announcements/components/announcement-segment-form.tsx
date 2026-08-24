"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { OCCUPANCY_ROLE_LABEL } from "@/features/people/occupancy-role";

import {
  countSegmentRecipientsAction,
  createAnnouncementDraftAction,
  getBuildingTowersAndFloorsAction,
  getExcludedSegmentRecipientsAction,
  searchPeopleForSegmentAction,
  updateAnnouncementDraftAction,
} from "../actions";
import { ExcludedRecipientsList } from "./excluded-recipients-list";
import type { ExcludedSegmentRecipient, PersonSearchResult } from "../queries";
import type { SegmentCriteria } from "../segment-schema";
import {
  ANNOUNCEMENT_TEMPLATES,
  applyTemplateVariables,
  getAnnouncementTemplate,
} from "../templates";

const ALL_BUILDINGS_VALUE = "__all__";
const BLANK_TEMPLATE_VALUE = "__blank__";
const ROLE_OPTIONS = ["owner", "tenant"] as const;

type AddedPerson = {
  id: string;
  label: string;
};

export type InitialAnnouncementDraft = {
  id: string;
  title: string;
  body: string;
  buildingId: string | null;
  segment: SegmentCriteria;
  templateId: string | null;
  templateVariables: Record<string, string>;
  addedPeople: AddedPerson[];
};

function personLabel(p: {
  firstName: string;
  lastName: string | null;
  phoneE164: string | null;
}): string {
  const name = [p.firstName, p.lastName].filter(Boolean).join(" ");
  return p.phoneE164 ? `${name} (${p.phoneE164})` : name;
}

// Constructor de segmentos (paso 8.2) + editor de contenido con plantillas
// (paso 8.3) -- único Client Component de la pantalla de creación/edición
// de un aviso: necesita estado local para ir armando el segmento y el
// cuerpo, con conteo y vista previa en vivo, ANTES de guardar nada.
//
// Combinación de criterios de destinatarios (documentado también en el
// reporte del paso 8.2): AND entre categorías (torre Y piso Y rol tienen
// que cumplirse todos para que una unidad/ocupación califique por los
// criterios GENERALES) -- OR dentro de una misma categoría (cualquiera de
// las torres elegidas, cualquiera de los pisos, cualquiera de los roles).
// Las personas agregadas a mano se UNEN (unión, no intersección) al
// resultado de los criterios generales -- ver el comentario reinterpretado
// de announcements.segment.
//
// Crear vs. editar (paso 8.3): sin `initialAnnouncement`, este componente
// crea un borrador nuevo y, al guardar con éxito, NAVEGA a
// /panel/announcements/[id] -- esa navegación (no un estado "guardado" en
// React) es lo que hace que recargar la pantalla siga mostrando el mismo
// borrador: la página de destino es un Server Component que relee todo de
// la base en cada carga, nunca depende de memoria del cliente. Con
// `initialAnnouncement`, guarda sobre ESE MISMO registro
// (updateAnnouncementDraftAction), nunca crea uno nuevo.
export function AnnouncementSegmentForm({
  buildings,
  initialAnnouncement,
}: {
  buildings: { id: string; name: string }[];
  initialAnnouncement?: InitialAnnouncementDraft;
}) {
  const router = useRouter();

  const [title, setTitle] = useState(initialAnnouncement?.title ?? "");
  const [buildingId, setBuildingId] = useState<string | null>(
    initialAnnouncement?.buildingId ?? null,
  );

  const [towerOptions, setTowerOptions] = useState<string[]>([]);
  const [floorOptions, setFloorOptions] = useState<string[]>([]);
  const [selectedTowers, setSelectedTowers] = useState<string[]>(
    initialAnnouncement?.segment.towers ?? [],
  );
  const [selectedFloors, setSelectedFloors] = useState<string[]>(
    initialAnnouncement?.segment.floors ?? [],
  );
  const [selectedRoles, setSelectedRoles] = useState<SegmentCriteria["roles"]>(
    initialAnnouncement?.segment.roles ?? [],
  );

  const [personQuery, setPersonQuery] = useState("");
  const [personResults, setPersonResults] = useState<PersonSearchResult[]>([]);
  const [addedPeople, setAddedPeople] = useState<AddedPerson[]>(
    initialAnnouncement?.addedPeople ?? [],
  );

  // Plantilla (paso 8.3) -- si el borrador reabierto referencia un
  // `templateId` que ya no existe en ANNOUNCEMENT_TEMPLATES (se borró del
  // código después de guardar este borrador), cae a modo "sin plantilla"
  // mostrando el `body` ya guardado como texto libre -- nada se pierde,
  // ver el comentario de la columna en src/db/schema/announcements.ts.
  const initialTemplate = initialAnnouncement?.templateId
    ? getAnnouncementTemplate(initialAnnouncement.templateId)
    : undefined;
  const [templateId, setTemplateId] = useState<string | null>(
    initialTemplate ? (initialAnnouncement?.templateId ?? null) : null,
  );
  const [templateVariables, setTemplateVariables] = useState<
    Record<string, string>
  >(initialTemplate ? (initialAnnouncement?.templateVariables ?? {}) : {});
  const [freeBody, setFreeBody] = useState(
    initialTemplate ? "" : (initialAnnouncement?.body ?? ""),
  );
  const [attemptedSave, setAttemptedSave] = useState(false);

  const selectedTemplate = templateId
    ? getAnnouncementTemplate(templateId)
    : undefined;
  // El cuerpo que efectivamente se guarda: con plantilla, las variables de
  // comunicado ya sustituidas y los placeholders por destinatario
  // ({{nombre}}/{{unidad}}) todavía visibles como placeholder -- la
  // interpolación real por persona es del paso 8.5, no de acá. Sin
  // plantilla, es exactamente lo que el administrador tipeó.
  const effectiveBody = selectedTemplate
    ? applyTemplateVariables(selectedTemplate.bodyTemplate, templateVariables)
    : freeBody;
  const missingVariableKeys = selectedTemplate
    ? selectedTemplate.variables
        .filter((v) => !templateVariables[v.key]?.trim())
        .map((v) => v.key)
    : [];

  const [counts, setCounts] = useState<{
    qualifiedWithPhone: number;
    qualifiedWithoutPhone: number;
  } | null>(null);
  const [countPending, setCountPending] = useState(false);
  const [countError, setCountError] = useState<string | null>(null);

  // Detalle de excluidos por teléfono (paso 8.7) -- lazy, solo se pide
  // cuando el administrador clickea "Ver detalle" (no en cada debounce
  // del conteo de arriba, ver el comentario de
  // getExcludedSegmentRecipientsAction en actions.ts).
  const [excludedOpen, setExcludedOpen] = useState(false);
  const [excluded, setExcluded] = useState<ExcludedSegmentRecipient[] | null>(
    null,
  );
  const [excludedPending, setExcludedPending] = useState(false);
  const [excludedError, setExcludedError] = useState<string | null>(null);

  const [savePending, setSavePending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Cambiar de edificio invalida torres/pisos elegidos -- una torre/piso
  // de OTRO edificio no tiene ningún sentido acá (mismo criterio que
  // "cambiar de edificio limpia cualquier unidad ya elegida" en el filtro
  // de la bandeja de reclamos, paso 6.1). Reset SÍNCRONO ajustado durante
  // el render (mismo patrón ya usado en TicketActionsPanel para
  // sincronizar el input de responsable con la prop) -- no en un
  // useEffect: es estado derivado de `buildingId`, no una sincronización
  // con un sistema externo, así que setState "en efecto" acá causaría un
  // frame de más con las torres/pisos viejos todavía visibles.
  const [prevBuildingId, setPrevBuildingId] = useState(buildingId);
  if (buildingId !== prevBuildingId) {
    setPrevBuildingId(buildingId);
    setSelectedTowers([]);
    setSelectedFloors([]);
    setTowerOptions([]);
    setFloorOptions([]);
  }

  // Cambiar de plantilla (o volver a "sin plantilla") invalida las
  // variables ya completadas -- mismo motivo y mismo patrón que el reset
  // de torres/pisos de arriba: es estado derivado de `templateId`, no una
  // sincronización con un sistema externo.
  const [prevTemplateId, setPrevTemplateId] = useState(templateId);
  if (templateId !== prevTemplateId) {
    setPrevTemplateId(templateId);
    setTemplateVariables({});
    setAttemptedSave(false);
  }

  // Acá SÍ un useEffect real: buscar las opciones de torre/piso es I/O
  // real contra el servidor (un sistema externo), no estado derivado.
  useEffect(() => {
    if (!buildingId) {
      return;
    }
    let cancelled = false;
    getBuildingTowersAndFloorsAction(buildingId).then((result) => {
      if (!cancelled) {
        setTowerOptions(result.towers);
        setFloorOptions(result.floors);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [buildingId]);

  // Conteo en vivo con debounce (400ms, mismo valor ya usado en el
  // buscador de la bandeja de reclamos, paso 6.1) -- contra datos REALES
  // en cada cambio de criterio, nunca un estimado. Todo el setState vive
  // ADENTRO del callback del timeout (nunca sincrónico en el cuerpo del
  // efecto) -- evita el render en cascada que dispara la regla
  // react-hooks/set-state-in-effect.
  //
  // `cancelled` -- CORRECCIÓN encontrada probando el paso 8.2 con datos
  // reales: sin este flag, la respuesta del pedido de conteo INICIAL
  // (buildingId=null, disparado al montar) podía llegar DESPUÉS de la
  // respuesta del pedido siguiente (ya con el edificio elegido) -- dos
  // pedidos al servidor no garantizan resolver en el orden en que se
  // lanzaron. Sin el guard, la respuesta vieja pisaba el conteo correcto
  // ya mostrado, dejando en pantalla un número mayor (el de "todos los
  // edificios") después de haber elegido un edificio puntual. Mismo
  // patrón que ya usa el efecto de arriba (towers/floors) -- se aplica acá
  // también, no solo ahí.
  useEffect(() => {
    const segment: SegmentCriteria = {
      towers: selectedTowers,
      floors: selectedFloors,
      roles: selectedRoles,
      personIds: addedPeople.map((p) => p.id),
    };
    let cancelled = false;
    const timeout = setTimeout(async () => {
      setCountPending(true);
      setCountError(null);
      const result = await countSegmentRecipientsAction({
        buildingId,
        segment,
      });
      if (cancelled) {
        return;
      }
      setCountPending(false);
      if (result.ok) {
        setCounts({
          qualifiedWithPhone: result.qualifiedWithPhone,
          qualifiedWithoutPhone: result.qualifiedWithoutPhone,
        });
      } else {
        setCountError(result.error);
        setCounts(null);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [buildingId, selectedTowers, selectedFloors, selectedRoles, addedPeople]);

  // Cierra el detalle de excluidos (paso 8.7) cada vez que el criterio
  // cambia -- sin esto, un "Ver detalle" abierto seguiría mostrando la
  // lista vieja mientras counts.qualifiedWithoutPhone ya cambió de número
  // para el criterio nuevo, dos piezas de la misma pantalla contando cosas
  // distintas. Estado derivado del criterio, mismo patrón (ajustado
  // SÍNCRONAMENTE durante el render, no en un useEffect) ya usado arriba
  // para el reset de torres/pisos al cambiar de edificio -- un
  // useEffect acá dispararía el error de lint `react-hooks/set-state-in-
  // effect` (setState síncrono dentro de un efecto), exactamente el motivo
  // por el que esos resets ya se escriben así en este archivo.
  const excludedResetKey = JSON.stringify([
    buildingId,
    selectedTowers,
    selectedFloors,
    selectedRoles,
    addedPeople.map((p) => p.id),
  ]);
  const [prevExcludedResetKey, setPrevExcludedResetKey] =
    useState(excludedResetKey);
  if (excludedResetKey !== prevExcludedResetKey) {
    setPrevExcludedResetKey(excludedResetKey);
    setExcludedOpen(false);
    setExcluded(null);
    setExcludedError(null);
  }

  async function handleToggleExcluded() {
    if (excludedOpen) {
      setExcludedOpen(false);
      return;
    }
    setExcludedOpen(true);
    setExcludedPending(true);
    setExcludedError(null);
    const segment: SegmentCriteria = {
      towers: selectedTowers,
      floors: selectedFloors,
      roles: selectedRoles,
      personIds: addedPeople.map((p) => p.id),
    };
    const result = await getExcludedSegmentRecipientsAction({
      buildingId,
      segment,
    });
    setExcludedPending(false);
    if (result.ok) {
      setExcluded(result.excluded);
    } else {
      setExcludedError(result.error);
    }
  }

  // Búsqueda de personas con debounce, mismo patrón -- el "limpiar
  // resultados si la búsqueda es muy corta" también vive adentro del
  // timeout, por el mismo motivo de arriba. Mismo guard `cancelled` que el
  // efecto de conteo -- misma clase de bug (una búsqueda vieja podría
  // resolver después de una más nueva y pisar sus resultados).
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => {
    clearTimeout(searchDebounceRef.current);
    let cancelled = false;
    searchDebounceRef.current = setTimeout(async () => {
      if (personQuery.trim().length < 2) {
        if (!cancelled) {
          setPersonResults([]);
        }
        return;
      }
      const results = await searchPeopleForSegmentAction(personQuery);
      if (!cancelled) {
        setPersonResults(results);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(searchDebounceRef.current);
    };
  }, [personQuery]);

  function toggleInArray<T>(list: T[], value: T): T[] {
    return list.includes(value)
      ? list.filter((v) => v !== value)
      : [...list, value];
  }

  function addPerson(person: PersonSearchResult) {
    if (addedPeople.some((p) => p.id === person.id)) {
      return;
    }
    setAddedPeople([
      ...addedPeople,
      { id: person.id, label: personLabel(person) },
    ]);
    setPersonQuery("");
    setPersonResults([]);
  }

  function removePerson(id: string) {
    setAddedPeople(addedPeople.filter((p) => p.id !== id));
  }

  function handleSave() {
    setSaveError(null);
    setAttemptedSave(true);

    if (!title.trim()) {
      setSaveError("Ingresá un título.");
      return;
    }
    if (!effectiveBody.trim()) {
      setSaveError("Ingresá el texto del aviso.");
      return;
    }
    if (missingVariableKeys.length > 0) {
      setSaveError(
        "Completá todas las variables de la plantilla antes de guardar.",
      );
      return;
    }

    setSavePending(true);
    const segment: SegmentCriteria = {
      towers: selectedTowers,
      floors: selectedFloors,
      roles: selectedRoles,
      personIds: addedPeople.map((p) => p.id),
    };
    const payload = {
      title,
      body: effectiveBody,
      buildingId,
      segment,
      templateId,
      templateVariables,
    };

    if (initialAnnouncement) {
      updateAnnouncementDraftAction({
        id: initialAnnouncement.id,
        ...payload,
      }).then((result) => {
        setSavePending(false);
        if (result.ok) {
          toast.success("Borrador guardado.");
          router.refresh();
        } else {
          setSaveError(result.error);
        }
      });
    } else {
      createAnnouncementDraftAction(payload).then((result) => {
        setSavePending(false);
        if (result.ok) {
          toast.success("Borrador guardado.");
          router.push(`/panel/announcements/${result.id}`);
        } else {
          setSaveError(result.error);
        }
      });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {initialAnnouncement && (
        <div className="border-border bg-canvas flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
          <span className="text-ink-muted">
            Editando el borrador &quot;{initialAnnouncement.title}&quot;.
          </span>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link
                href={`/panel/announcements/${initialAnnouncement.id}/preview`}
              >
                Ver vista previa
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link
                href={`/panel/announcements/${initialAnnouncement.id}/send`}
              >
                Enviar aviso
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/panel/announcements/new">Crear otro aviso</Link>
            </Button>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Datos del aviso</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="announcement-title">Título</FieldLabel>
            <Input
              id="announcement-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: Corte de agua programado"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="announcement-template">Plantilla</FieldLabel>
            <Select
              value={templateId ?? BLANK_TEMPLATE_VALUE}
              onValueChange={(value) =>
                setTemplateId(value === BLANK_TEMPLATE_VALUE ? null : value)
              }
            >
              <SelectTrigger id="announcement-template">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={BLANK_TEMPLATE_VALUE}>
                  Sin plantilla (texto en blanco)
                </SelectItem>
                {ANNOUNCEMENT_TEMPLATES.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {selectedTemplate ? (
            <>
              {selectedTemplate.variables.map((variable) => (
                <Field key={variable.key}>
                  <FieldLabel htmlFor={`announcement-variable-${variable.key}`}>
                    {variable.label}
                  </FieldLabel>
                  <Input
                    id={`announcement-variable-${variable.key}`}
                    value={templateVariables[variable.key] ?? ""}
                    onChange={(e) =>
                      setTemplateVariables({
                        ...templateVariables,
                        [variable.key]: e.target.value,
                      })
                    }
                    placeholder={variable.placeholder}
                  />
                  {attemptedSave &&
                    missingVariableKeys.includes(variable.key) && (
                      <p className="text-destructive text-xs">
                        Completá este campo.
                      </p>
                    )}
                </Field>
              ))}
              <Field>
                <FieldLabel htmlFor="announcement-preview">
                  Vista previa
                </FieldLabel>
                <Textarea
                  id="announcement-preview"
                  value={effectiveBody}
                  readOnly
                  rows={6}
                  className="bg-canvas"
                />
                <p className="text-ink-muted text-xs">
                  {"{{nombre}}"} y {"{{unidad}}"} se completan recién al mandar
                  el aviso, con los datos reales de cada vecino.
                </p>
              </Field>
            </>
          ) : (
            <Field>
              <FieldLabel htmlFor="announcement-body">Mensaje</FieldLabel>
              <Textarea
                id="announcement-body"
                value={freeBody}
                onChange={(e) => setFreeBody(e.target.value)}
                rows={4}
                placeholder="Escribí el texto que van a recibir los vecinos."
              />
            </Field>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Destinatarios</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Field>
            <FieldLabel htmlFor="announcement-building">Edificio</FieldLabel>
            <Select
              value={buildingId ?? ALL_BUILDINGS_VALUE}
              onValueChange={(value) =>
                setBuildingId(value === ALL_BUILDINGS_VALUE ? null : value)
              }
            >
              <SelectTrigger id="announcement-building">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_BUILDINGS_VALUE}>
                  Todos los edificios
                </SelectItem>
                {buildings.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {buildingId === null && (
              <p className="text-ink-muted text-xs">
                Con &quot;Todos los edificios&quot; no se puede filtrar por
                torre ni piso -- esos criterios necesitan un edificio puntual.
              </p>
            )}
          </Field>

          {buildingId && towerOptions.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-ink-muted text-xs">Torre</span>
              <div className="flex flex-wrap gap-3">
                {towerOptions.map((tower) => (
                  <label
                    key={tower}
                    className="flex items-center gap-1.5 text-sm"
                  >
                    <Checkbox
                      checked={selectedTowers.includes(tower)}
                      onCheckedChange={() =>
                        setSelectedTowers(toggleInArray(selectedTowers, tower))
                      }
                    />
                    {tower}
                  </label>
                ))}
              </div>
            </div>
          )}

          {buildingId && floorOptions.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-ink-muted text-xs">Piso</span>
              <div className="flex flex-wrap gap-3">
                {floorOptions.map((floor) => (
                  <label
                    key={floor}
                    className="flex items-center gap-1.5 text-sm"
                  >
                    <Checkbox
                      checked={selectedFloors.includes(floor)}
                      onCheckedChange={() =>
                        setSelectedFloors(toggleInArray(selectedFloors, floor))
                      }
                    />
                    {floor}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="text-ink-muted text-xs">Rol</span>
            <div className="flex flex-wrap gap-3">
              {ROLE_OPTIONS.map((role) => (
                <label key={role} className="flex items-center gap-1.5 text-sm">
                  <Checkbox
                    checked={selectedRoles.includes(role)}
                    onCheckedChange={() =>
                      setSelectedRoles(toggleInArray(selectedRoles, role))
                    }
                  />
                  {OCCUPANCY_ROLE_LABEL[role]}
                </label>
              ))}
            </div>
          </div>

          <Field>
            <FieldLabel htmlFor="announcement-person-search">
              Agregar una persona puntual
            </FieldLabel>
            <Input
              id="announcement-person-search"
              value={personQuery}
              onChange={(e) => setPersonQuery(e.target.value)}
              placeholder="Buscar por nombre o teléfono..."
            />
            {personResults.length > 0 && (
              <ul className="border-border divide-border mt-1 flex flex-col divide-y rounded-md border">
                {personResults.map((person) => (
                  <li key={person.id}>
                    <button
                      type="button"
                      className="hover:bg-canvas w-full px-3 py-2 text-left text-sm"
                      onClick={() => addPerson(person)}
                    >
                      {personLabel(person)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {addedPeople.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {addedPeople.map((p) => (
                  <Badge
                    key={p.id}
                    variant="secondary"
                    className="font-body gap-1.5"
                  >
                    {p.label}
                    <button
                      type="button"
                      aria-label={`Quitar a ${p.label}`}
                      onClick={() => removePerson(p.id)}
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </Field>

          <div className="border-border rounded-md border border-dashed p-3 text-sm">
            {countPending && (
              <p className="text-ink-muted">Calculando destinatarios…</p>
            )}
            {!countPending && countError && (
              <p className="text-destructive">{countError}</p>
            )}
            {!countPending && !countError && counts && (
              <div className="flex flex-col gap-0.5">
                <p className="text-ink font-medium">
                  {counts.qualifiedWithPhone} destinatario
                  {counts.qualifiedWithPhone === 1 ? "" : "s"} van a recibir
                  este aviso.
                </p>
                {counts.qualifiedWithoutPhone > 0 && (
                  <>
                    <p className="text-ink-muted text-xs">
                      {counts.qualifiedWithoutPhone} persona
                      {counts.qualifiedWithoutPhone === 1 ? "" : "s"} más
                      califica
                      {counts.qualifiedWithoutPhone === 1 ? "" : "n"} por este
                      segmento, pero no tiene
                      {counts.qualifiedWithoutPhone === 1 ? "" : "n"} un
                      teléfono válido cargado -- no va
                      {counts.qualifiedWithoutPhone === 1 ? "" : "n"} a recibir
                      el aviso.{" "}
                      <button
                        type="button"
                        onClick={handleToggleExcluded}
                        className="text-ink-muted hover:text-ink underline underline-offset-2"
                      >
                        {excludedOpen ? "Ocultar detalle" : "Ver detalle"}
                      </button>
                    </p>
                    {excludedOpen && (
                      <div className="mt-1">
                        {excludedPending && (
                          <p className="text-ink-muted text-xs">
                            Buscando quiénes son…
                          </p>
                        )}
                        {!excludedPending && excludedError && (
                          <p className="text-destructive text-xs">
                            {excludedError}
                          </p>
                        )}
                        {!excludedPending && excluded && (
                          <ExcludedRecipientsList recipients={excluded} />
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {saveError && <p className="text-destructive text-sm">{saveError}</p>}

      <Button
        type="button"
        className="self-start"
        disabled={savePending || !title.trim() || !effectiveBody.trim()}
        onClick={handleSave}
      >
        {savePending ? "Guardando…" : "Guardar borrador"}
      </Button>
    </div>
  );
}
