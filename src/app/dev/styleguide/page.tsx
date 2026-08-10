// Ruta de desarrollo: eliminar antes de producción (no es una pantalla de negocio).

import type { ReactNode } from "react";
import { AlertTriangle, Info } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { UnitTag } from "@/features/buildings/components/unit-tag";
import {
  PriorityBadge,
  type Priority,
} from "@/features/tickets/components/priority-badge";
import {
  StatusBadge,
  type TicketStatus,
} from "@/features/tickets/components/status-badge";
import { TicketCode } from "@/features/tickets/components/ticket-code";

import { ToastDemo } from "./toast-demo";

const COLOR_SWATCHES = [
  { name: "ink", hex: "#16181D", className: "bg-ink" },
  { name: "ink-muted", hex: "#5B6169", className: "bg-ink-muted" },
  {
    name: "surface",
    hex: "#FFFFFF",
    className: "bg-surface border border-border",
  },
  {
    name: "canvas",
    hex: "#F3F5F4",
    className: "bg-canvas border border-border",
  },
  { name: "border", hex: "#DDE1E0", className: "bg-border" },
  { name: "primary", hex: "#14484F", className: "bg-primary" },
  {
    name: "primary-fg",
    hex: "#FFFFFF",
    className: "bg-primary-fg border border-border",
  },
] as const;

const SEMANTIC_SWATCHES = [
  { name: "urgente", hex: "#B42318", className: "bg-urgente" },
  { name: "alta", hex: "#B54708", className: "bg-alta" },
  { name: "media", hex: "#175CD3", className: "bg-media" },
  { name: "baja", hex: "#5B6169", className: "bg-baja" },
  { name: "resuelto", hex: "#067647", className: "bg-resuelto" },
] as const;

const TYPE_SCALE = [
  { token: "text-xs", className: "text-xs" },
  { token: "text-sm", className: "text-sm" },
  { token: "text-base", className: "text-base" },
  { token: "text-lg", className: "text-lg" },
  { token: "text-xl", className: "text-xl" },
  { token: "text-2xl", className: "text-2xl" },
  { token: "text-3xl", className: "text-3xl" },
  { token: "text-4xl", className: "text-4xl" },
] as const;

const PRIORITIES: Priority[] = ["urgente", "alta", "media", "baja"];
const STATUSES: TicketStatus[] = [
  "abierto",
  "en_progreso",
  "resuelto",
  "cerrado",
];

const SAMPLE_ROWS: {
  unit: string;
  code: string;
  priority: Priority;
  status: TicketStatus;
  description: string;
}[] = [
  {
    unit: "5°B",
    code: "TC-2026-0143",
    priority: "urgente",
    status: "abierto",
    description: "Pérdida de agua en el palier",
  },
  {
    unit: "12°A",
    code: "TC-2026-0139",
    priority: "media",
    status: "en_progreso",
    description: "Luz quemada en cochera",
  },
  {
    unit: "PB",
    code: "TC-2026-0121",
    priority: "baja",
    status: "resuelto",
    description: "Ruido de bomba de agua",
  },
];

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-ink text-xl font-semibold">{title}</h2>
        {description ? (
          <p className="text-ink-muted mt-1 text-sm">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export default function StyleguidePage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-12 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-2">
        <Badge variant="outline" className="border-border text-ink-muted w-fit">
          /dev/styleguide — solo desarrollo
        </Badge>
        <h1 className="text-ink text-3xl font-bold sm:text-4xl">
          Sistema de diseño de Consofy
        </h1>
        <p className="text-ink-muted max-w-2xl text-base">
          Paleta, tipografía y componentes base. Esta ruta no es una pantalla de
          negocio: se elimina antes de salir a producción.
        </p>
      </header>

      <Section title="Paleta — superficies, texto y marca">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {COLOR_SWATCHES.map((swatch) => (
            <div key={swatch.name} className="flex flex-col gap-2">
              <div className={`h-16 rounded-md ${swatch.className}`} />
              <div>
                <p className="text-ink text-sm font-medium">{swatch.name}</p>
                <p className="text-ink-muted font-mono text-xs">{swatch.hex}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Paleta — estado y prioridad"
        description="No decorativos: comunican información. Se usan como texto sobre un fondo del mismo color al 10% de opacidad (ver PriorityBadge / StatusBadge más abajo)."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          {SEMANTIC_SWATCHES.map((swatch) => (
            <div key={swatch.name} className="flex flex-col gap-2">
              <div className={`h-16 rounded-md ${swatch.className}`} />
              <div>
                <p className="text-ink text-sm font-medium">{swatch.name}</p>
                <p className="text-ink-muted font-mono text-xs">{swatch.hex}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Tipografía">
        <div className="flex flex-col gap-4">
          <div>
            <p className="font-display text-ink text-2xl font-semibold">
              Archivo — títulos, encabezados y UI
            </p>
            <p className="font-body text-ink text-base">
              Inter — texto corrido y formularios
            </p>
            <p className="text-ink font-mono text-base">
              IBM Plex Mono — 5°B · TC-2026-0143 · 10/08/2026
            </p>
          </div>
          <Separator />
          <div className="flex flex-col gap-3">
            {TYPE_SCALE.map((step) => (
              <div
                key={step.token}
                className="border-border flex flex-col gap-1 border-b pb-3 last:border-0 sm:flex-row sm:items-baseline sm:gap-4"
              >
                <span className="text-ink-muted w-20 shrink-0 font-mono text-xs">
                  {step.token}
                </span>
                <span className={`${step.className} text-ink`}>
                  Reclamo registrado correctamente
                </span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Sistema propio — identificadores">
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-3">
            <UnitTag unit="5°B" />
            <UnitTag unit="12°A" />
            <UnitTag unit="PB" size="sm" />
            <TicketCode code="TC-2026-0143" />
          </div>
          <div className="flex flex-wrap gap-2">
            {PRIORITIES.map((priority) => (
              <PriorityBadge key={priority} priority={priority} />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((status) => (
              <StatusBadge key={status} status={status} />
            ))}
          </div>

          <div className="border-border overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unidad</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Prioridad</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {SAMPLE_ROWS.map((row) => (
                  <TableRow key={row.code}>
                    <TableCell>
                      <UnitTag unit={row.unit} size="sm" />
                    </TableCell>
                    <TableCell>
                      <TicketCode code={row.code} />
                    </TableCell>
                    <TableCell className="text-ink whitespace-normal">
                      {row.description}
                    </TableCell>
                    <TableCell>
                      <PriorityBadge priority={row.priority} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </Section>

      <Section title="Botones">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Button>Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm">Small</Button>
            <Button size="default">Default</Button>
            <Button size="lg">Large</Button>
            <Button disabled>Disabled</Button>
          </div>
        </div>
      </Section>

      <Section
        title="Formulario"
        description="Inputs, textarea, select y composición con Field."
      >
        <Card>
          <CardContent className="grid gap-6 pt-4 sm:grid-cols-2">
            <FieldSet className="sm:col-span-2">
              <FieldLegend>Datos del reclamo</FieldLegend>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="sg-nombre">Nombre</FieldLabel>
                  <Input id="sg-nombre" placeholder="Nombre y apellido" />
                  <FieldDescription>
                    Como querés que te contactemos.
                  </FieldDescription>
                </Field>
                <Field data-invalid="true">
                  <FieldLabel htmlFor="sg-unidad">Unidad funcional</FieldLabel>
                  <Input id="sg-unidad" aria-invalid defaultValue="" />
                  <FieldError>Ingresá tu unidad (ej: 5°B).</FieldError>
                </Field>
              </FieldGroup>
            </FieldSet>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sg-categoria">Categoría</Label>
              <Select defaultValue="plomeria">
                <SelectTrigger id="sg-categoria" className="w-full">
                  <SelectValue placeholder="Elegí una categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="plomeria">Plomería</SelectItem>
                  <SelectItem value="electricidad">Electricidad</SelectItem>
                  <SelectItem value="ascensor">Ascensor</SelectItem>
                  <SelectItem value="ruidos">Ruidos molestos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sg-prioridad">Prioridad</Label>
              <Select defaultValue="media">
                <SelectTrigger id="sg-prioridad" className="w-full">
                  <SelectValue placeholder="Elegí una prioridad" />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {priority}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="sg-descripcion">Descripción</Label>
              <Textarea
                id="sg-descripcion"
                placeholder="Contanos qué está pasando..."
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sg-input-disabled">Campo deshabilitado</Label>
              <Input id="sg-input-disabled" disabled value="No editable" />
            </div>
          </CardContent>
        </Card>
      </Section>

      <Section title="Feedback y overlays">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <Alert>
              <Info />
              <AlertTitle>El reclamo se guardó correctamente</AlertTitle>
              <AlertDescription>
                Ya podés avisarle al administrador por WhatsApp.
              </AlertDescription>
            </Alert>
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertTitle>No pudimos enviar el mensaje</AlertTitle>
              <AlertDescription>
                El reclamo quedó registrado igual: podés reintentar el envío.
              </AlertDescription>
            </Alert>
          </div>

          <div className="flex flex-wrap gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">Abrir diálogo</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Marcar reclamo como resuelto</DialogTitle>
                  <DialogDescription>
                    Esta acción notifica al vecino que el reclamo TC-2026-0143
                    fue atendido.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline">Cancelar</Button>
                  <Button>Confirmar</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline">Abrir panel lateral</Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Detalle del reclamo</SheetTitle>
                  <SheetDescription>
                    Unidad {SAMPLE_ROWS[0]?.unit} · {SAMPLE_ROWS[0]?.code}
                  </SheetDescription>
                </SheetHeader>
              </SheetContent>
            </Sheet>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline">Ver popover</Button>
              </PopoverTrigger>
              <PopoverContent>
                Reclamo cargado el 10/08/2026 a las 14:32.
              </PopoverContent>
            </Popover>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">Acciones</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Reclamo TC-2026-0143</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Marcar como resuelto</DropdownMenuItem>
                <DropdownMenuItem>Reasignar prioridad</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive">
                  Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <ToastDemo />
        </div>
      </Section>

      <Section title="Navegación y estructura">
        <div className="flex flex-col gap-6">
          <Tabs defaultValue="abiertos">
            <TabsList>
              <TabsTrigger value="abiertos">Abiertos</TabsTrigger>
              <TabsTrigger value="resueltos">Resueltos</TabsTrigger>
            </TabsList>
            <TabsContent value="abiertos" className="text-ink-muted">
              2 reclamos abiertos en este edificio.
            </TabsContent>
            <TabsContent value="resueltos" className="text-ink-muted">
              14 reclamos resueltos este mes.
            </TabsContent>
          </Tabs>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Edificio Belgrano 1450</CardTitle>
              </CardHeader>
              <CardContent className="text-ink-muted text-sm">
                24 unidades · 3 reclamos abiertos
              </CardContent>
            </Card>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-2/3" />
            </div>
          </div>

          <div className="w-fit">
            <Calendar />
          </div>
        </div>
      </Section>
    </main>
  );
}
