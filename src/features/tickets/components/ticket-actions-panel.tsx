"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

import {
  addTicketNoteAction,
  assignTicketAction,
  changeTicketPriorityAction,
  changeTicketStatusAction,
} from "../actions";
import { toBadgePriority } from "../status-mapping";
import {
  getTicketStatusActions,
  type TicketPriorityValue,
  type TicketStatusValue,
} from "../ticket-actions-schema";
import { PRIORITY_LABEL } from "./priority-badge";

const PRIORITY_ORDER: TicketPriorityValue[] = [
  "low",
  "medium",
  "high",
  "urgent",
];

// Panel de acciones del reclamo (paso 6.4) -- el único Client Component de
// esta pantalla; todo lo demás en /panel/tickets/[ticketId] sigue siendo
// Server Component puro (paso 6.3). Cuatro controles independientes, cada
// uno con su propio useTransition (mismo patrón que BuildingsList /
// setBuildingActiveAction): no hay un formulario único que los junte a
// todos, porque no son un solo "guardar" -- cada acción es su propio
// evento de historial, con su propio resultado y su propio error posible.
//
// Sin optimistic update local: el estado que se ve acá después de un click
// es siempre el que la base tiene de verdad, nunca un valor "adivinado" en
// el cliente. `revalidatePath()` (actions.ts) invalida el cache del lado
// del servidor, pero encontrado en la práctica probando este mismo paso:
// eso solo NO alcanza para que ESTA pantalla (ya montada, sin ninguna
// navegación de por medio) vuelva a pedir el RSC actualizado -- confirmado
// con un cambio de estado real donde la base quedaba correcta
// (`resolved`, verificado por SQL) pero los botones seguían mostrando el
// set de `in_progress` hasta un F5 manual. `router.refresh()`
// (`next/navigation`) de este lado, DENTRO de la misma transición, es lo
// que efectivamente le pide a Next.js que vuelva a traer los Server
// Components de la ruta actual -- sin esto, cada acción "funcionaba" (la
// base quedaba bien, el evento se escribía bien) pero la pantalla mentía
// hasta que alguien recargara a mano.
export function TicketActionsPanel({
  ticketId,
  currentStatus,
  currentPriority,
  currentAssignee,
  assigneeOptions,
}: {
  ticketId: string;
  currentStatus: TicketStatusValue;
  currentPriority: TicketPriorityValue;
  currentAssignee: string | null;
  assigneeOptions: string[];
}) {
  const router = useRouter();
  const [isStatusPending, startStatusTransition] = useTransition();
  const [pendingStatus, setPendingStatus] = useState<TicketStatusValue | null>(
    null,
  );
  const [isPriorityPending, startPriorityTransition] = useTransition();
  const [assigneeInput, setAssigneeInput] = useState(currentAssignee ?? "");
  const [isAssigneePending, startAssigneeTransition] = useTransition();
  const [noteInput, setNoteInput] = useState("");
  const [isNotePending, startNoteTransition] = useTransition();

  // Sincroniza el input si la prop cambia por otra vía (revalidación tras
  // otra acción, u otra pestaña) -- mismo patrón "ajustar durante el
  // render" que ya usa TicketFiltersBar para su buscador.
  const [prevAssignee, setPrevAssignee] = useState(currentAssignee);
  if (currentAssignee !== prevAssignee) {
    setPrevAssignee(currentAssignee);
    setAssigneeInput(currentAssignee ?? "");
  }

  function handleStatusChange(toStatus: TicketStatusValue) {
    setPendingStatus(toStatus);
    startStatusTransition(async () => {
      const result = await changeTicketStatusAction({
        ticketId,
        fromStatus: currentStatus,
        toStatus,
      });
      setPendingStatus(null);
      if (result.ok) {
        toast.success("Estado actualizado.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handlePriorityChange(priority: TicketPriorityValue) {
    startPriorityTransition(async () => {
      const result = await changeTicketPriorityAction({ ticketId, priority });
      if (result.ok) {
        toast.success("Prioridad actualizada.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleAssigneeSave() {
    startAssigneeTransition(async () => {
      const result = await assignTicketAction({
        ticketId,
        assignee: assigneeInput,
      });
      if (result.ok) {
        toast.success(
          assigneeInput.trim()
            ? "Responsable actualizado."
            : "Se quitó la asignación.",
        );
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleAddNote() {
    const note = noteInput.trim();
    if (!note) {
      return;
    }
    startNoteTransition(async () => {
      const result = await addTicketNoteAction({ ticketId, note });
      if (result.ok) {
        toast.success("Nota agregada.");
        setNoteInput("");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  const statusActions = getTicketStatusActions(currentStatus);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Acciones</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <span className="text-ink-muted text-xs">Estado</span>
          <div className="flex flex-wrap gap-2">
            {statusActions.map((action) => (
              <Button
                key={action.targetStatus}
                type="button"
                size="sm"
                variant={
                  action.targetStatus === "discarded"
                    ? "destructive"
                    : "outline"
                }
                disabled={isStatusPending}
                onClick={() => handleStatusChange(action.targetStatus)}
              >
                {isStatusPending && pendingStatus === action.targetStatus
                  ? "Guardando…"
                  : action.label}
              </Button>
            ))}
          </div>
        </div>

        <Field>
          <FieldLabel htmlFor="ticket-priority">Prioridad</FieldLabel>
          <Select
            value={currentPriority}
            disabled={isPriorityPending}
            onValueChange={(value) =>
              handlePriorityChange(value as TicketPriorityValue)
            }
          >
            <SelectTrigger id="ticket-priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITY_ORDER.map((p) => (
                <SelectItem key={p} value={p}>
                  {PRIORITY_LABEL[toBadgePriority(p)]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="ticket-assignee">Responsable</FieldLabel>
          <div className="flex gap-2">
            <Input
              id="ticket-assignee"
              list="ticket-assignee-options"
              placeholder="Sin asignar"
              value={assigneeInput}
              onChange={(e) => setAssigneeInput(e.target.value)}
              disabled={isAssigneePending}
            />
            <datalist id="ticket-assignee-options">
              {assigneeOptions.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
            <Button
              type="button"
              variant="outline"
              size="default"
              disabled={
                isAssigneePending ||
                assigneeInput.trim() === (currentAssignee ?? "")
              }
              onClick={handleAssigneeSave}
            >
              Guardar
            </Button>
          </div>
        </Field>

        <Field>
          <FieldLabel htmlFor="ticket-note">Agregar nota interna</FieldLabel>
          <Textarea
            id="ticket-note"
            placeholder="Solo la ve el equipo del panel -- el vecino nunca accede a esto."
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            disabled={isNotePending}
            rows={3}
          />
          <Button
            type="button"
            variant="outline"
            className="self-start"
            disabled={isNotePending || !noteInput.trim()}
            onClick={handleAddNote}
          >
            {isNotePending ? "Guardando…" : "Agregar nota"}
          </Button>
        </Field>
      </CardContent>
    </Card>
  );
}
