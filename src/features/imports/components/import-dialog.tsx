"use client";

import { startTransition, useActionState, useRef, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { confirmImportBatchAction, previewImportAction } from "../actions";
import {
  buildTemplateCsv,
  IMPORT_BATCH_SIZE,
  IMPORT_MAX_ROWS,
  initialImportPreviewState,
  type CsvColumnKey,
  type ImportBatchResult,
} from "../csv-schema";

// Plantilla descargable (decisión del reporte): un Blob generado en el
// cliente a partir de las mismas columnas que espera el servidor
// (buildTemplateCsv(), csv-schema.ts) -- nunca puede desalinearse de lo que
// el importador acepta. BOM al principio para que Excel, al abrir el
// archivo con doble click, lo reconozca como UTF-8 y no rompa los acentos
// de "Depósito"/"Número" DE LA PROPIA PLANTILLA.
function downloadTemplate() {
  const blob = new Blob(["﻿" + buildTemplateCsv()], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "plantilla-importacion.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

const EMPTY_RESULT: ImportBatchResult = {
  processedRows: 0,
  unitsCreated: 0,
  unitsReused: 0,
  peopleCreated: 0,
  peopleReused: 0,
  occupanciesCreated: 0,
  errors: [],
};

function mergeResults(
  a: ImportBatchResult,
  b: ImportBatchResult,
): ImportBatchResult {
  return {
    processedRows: a.processedRows + b.processedRows,
    unitsCreated: a.unitsCreated + b.unitsCreated,
    unitsReused: a.unitsReused + b.unitsReused,
    peopleCreated: a.peopleCreated + b.peopleCreated,
    peopleReused: a.peopleReused + b.peopleReused,
    occupanciesCreated: a.occupanciesCreated + b.occupanciesCreated,
    errors: [...a.errors, ...b.errors],
  };
}

type ConfirmPhase =
  | { status: "idle" }
  | { status: "running"; batchIndex: number; totalBatches: number }
  | { status: "done" };

// Diálogo de importación (paso 4.5). Entrega 1: subir archivo, previsualizar.
// Entrega 2 (esta): confirmar escribe de verdad, EN TANDAS manejadas por el
// cliente (no una sola invocación de servidor para el archivo entero) --
// ver la justificación completa en el reporte, resumen: cada tanda es una
// request corta e independiente, así que una interrupción a mitad de
// camino (timeout, conexión caída, pestaña cerrada) deja commiteadas
// exactamente las tandas que ya terminaron, ni una más.
export function ImportDialog({
  buildingId,
  open,
  onOpenChange,
}: {
  buildingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, dispatch, isPending] = useActionState(
    previewImportAction,
    initialImportPreviewState,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showForm, setShowForm] = useState(true);
  const [confirmPhase, setConfirmPhase] = useState<ConfirmPhase>({
    status: "idle",
  });
  const [result, setResult] = useState<ImportBatchResult>(EMPTY_RESULT);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      return;
    }
    const formData = new FormData();
    formData.set("buildingId", buildingId);
    formData.set("file", file);
    startTransition(() => {
      dispatch(formData);
      setShowForm(false);
      setConfirmPhase({ status: "idle" });
      setResult(EMPTY_RESULT);
    });
  }

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      setShowForm(true);
      setConfirmPhase({ status: "idle" });
      setResult(EMPTY_RESULT);
    }
    onOpenChange(nextOpen);
  }

  async function handleConfirm() {
    if (state.status !== "ready") {
      return;
    }
    const readyParsedRows = state.parsedRows.filter(
      (_, i) => state.rows[i]?.status === "ready",
    ) as { rowNumber: number; raw: Record<CsvColumnKey, string> }[];
    const batches = chunk(readyParsedRows, IMPORT_BATCH_SIZE);

    setConfirmPhase({
      status: "running",
      batchIndex: 0,
      totalBatches: batches.length,
    });
    let accumulated = EMPTY_RESULT;
    for (let i = 0; i < batches.length; i++) {
      const batchResult = await confirmImportBatchAction({
        buildingId,
        rows: batches[i],
      });
      accumulated = mergeResults(accumulated, batchResult);
      setResult(accumulated);
      setConfirmPhase({
        status: "running",
        batchIndex: i + 1,
        totalBatches: batches.length,
      });
    }
    setConfirmPhase({ status: "done" });
  }

  const showPreview = state.status === "ready" && !showForm;
  const readyRowCount =
    state.status === "ready"
      ? state.rows.filter((r) => r.status === "ready").length
      : 0;
  const isConfirming = confirmPhase.status === "running";
  const isDone = confirmPhase.status === "done";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar CSV</DialogTitle>
          <DialogDescription>
            Subí un archivo con unidades, vecinos y sus ocupaciones. Vas a
            revisar todo antes de que se guarde nada en la base.
          </DialogDescription>
        </DialogHeader>

        {!showPreview && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {state.status === "file-error" && (
              <Alert variant="destructive">
                <AlertDescription>{state.message}</AlertDescription>
              </Alert>
            )}

            <Field>
              <FieldLabel htmlFor="import-file">Archivo CSV</FieldLabel>
              <Input
                id="import-file"
                type="file"
                accept=".csv,text/csv"
                ref={fileInputRef}
                disabled={isPending}
              />
              <FieldDescription>
                Funciona con coma o punto y coma como separador -- igual si lo
                exportaste de Excel en español. Hasta {IMPORT_MAX_ROWS} filas
                por archivo.{" "}
                <button
                  type="button"
                  className="text-primary underline underline-offset-4"
                  onClick={downloadTemplate}
                >
                  Descargar plantilla
                </button>{" "}
                con las columnas esperadas.
              </FieldDescription>
            </Field>

            <Button type="submit" disabled={isPending}>
              {isPending ? "Revisando…" : "Previsualizar"}
            </Button>
          </form>
        )}

        {showPreview && state.status === "ready" && !isDone && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-2 text-sm sm:grid-cols-6">
              <SummaryStat label="Filas" value={state.summary.totalRows} />
              <SummaryStat
                label="Con error"
                value={state.summary.errorRows}
                tone={state.summary.errorRows > 0 ? "destructive" : undefined}
              />
              <SummaryStat
                label="Unidades nuevas"
                value={state.summary.unitsToCreate}
              />
              <SummaryStat
                label="Unidades existentes"
                value={state.summary.unitsExisting}
              />
              <SummaryStat
                label="Vecinos nuevos"
                value={state.summary.peopleToCreate}
              />
              <SummaryStat
                label="Vecinos existentes"
                value={state.summary.peopleExisting}
              />
            </div>

            {isConfirming && (
              <Alert>
                <AlertDescription>
                  Importando… tanda{" "}
                  {confirmPhase.status === "running"
                    ? confirmPhase.batchIndex
                    : 0}{" "}
                  de{" "}
                  {confirmPhase.status === "running"
                    ? confirmPhase.totalBatches
                    : 0}
                  . Ya se crearon {result.unitsCreated} unidades,{" "}
                  {result.peopleCreated} vecinos y {result.occupanciesCreated}{" "}
                  ocupaciones. No cierres esta ventana.
                </AlertDescription>
              </Alert>
            )}

            <div className="max-h-96 overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">Fila</TableHead>
                    <TableHead>Unidad</TableHead>
                    <TableHead>Vecino</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Detalle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {state.rows.map((row) => (
                    <TableRow key={row.rowNumber}>
                      <TableCell className="text-ink-muted">
                        {row.rowNumber}
                      </TableCell>
                      {row.status === "error" ? (
                        <TableCell colSpan={4}>
                          <div className="flex flex-col gap-1">
                            <Badge variant="destructive" className="w-fit">
                              Error
                            </Badge>
                            {row.issues.map((issue, i) => (
                              <p key={i} className="text-destructive text-sm">
                                {issue}
                              </p>
                            ))}
                          </div>
                        </TableCell>
                      ) : (
                        <>
                          <TableCell>
                            {row.unit.label}{" "}
                            <Badge
                              variant={
                                row.unit.existing ? "secondary" : "outline"
                              }
                              className="ml-1"
                            >
                              {row.unit.existing ? "Existente" : "Nueva"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {row.person ? (
                              <>
                                {row.person.label}{" "}
                                <Badge
                                  variant={
                                    row.person.existing
                                      ? "secondary"
                                      : "outline"
                                  }
                                  className="ml-1"
                                >
                                  {row.person.existing ? "Existente" : "Nuevo"}
                                </Badge>
                              </>
                            ) : (
                              <span className="text-ink-muted">
                                Sin vecino en esta fila
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {row.occupancy ? (
                              <span className="inline-flex items-center gap-1.5">
                                {row.occupancy.roleLabel}
                                {row.occupancy.isPrimary && (
                                  <Badge variant="outline" className="text-xs">
                                    Principal
                                  </Badge>
                                )}
                              </span>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell className="text-ink-muted text-sm">
                            {row.occupancy?.note ?? ""}
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {isDone && (
          <div className="flex flex-col gap-4">
            <Alert>
              <AlertDescription>
                Importación terminada. Se crearon {result.unitsCreated} unidades
                ({result.unitsReused} ya existían), {result.peopleCreated}{" "}
                vecinos ({result.peopleReused} ya existían) y se crearon{" "}
                {result.occupanciesCreated} ocupaciones.
              </AlertDescription>
            </Alert>
            {result.errors.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-destructive text-sm font-medium">
                  {result.errors.length === 1
                    ? "1 fila no se pudo guardar:"
                    : `${result.errors.length} filas no se pudieron guardar:`}
                </p>
                <div className="max-h-48 overflow-auto rounded-lg border">
                  <Table>
                    <TableBody>
                      {result.errors.map((error) => (
                        <TableRow key={error.rowNumber}>
                          <TableCell className="text-ink-muted w-14">
                            {error.rowNumber}
                          </TableCell>
                          <TableCell className="text-destructive text-sm">
                            {error.message}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {showPreview && !isConfirming && !isDone && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowForm(true)}
            >
              Volver
            </Button>
          )}
          {showPreview && !isDone && (
            <Button
              type="button"
              disabled={isConfirming || readyRowCount === 0}
              onClick={handleConfirm}
            >
              {isConfirming
                ? "Importando…"
                : `Confirmar importación (${readyRowCount})`}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={isConfirming}
            onClick={() => handleClose(false)}
          >
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "destructive";
}) {
  return (
    <div className="rounded-lg border p-2 text-center">
      <div
        className={
          tone === "destructive" && value > 0
            ? "text-destructive font-display text-lg font-semibold"
            : "font-display text-lg font-semibold"
        }
      >
        {value}
      </div>
      <div className="text-ink-muted text-xs">{label}</div>
    </div>
  );
}
