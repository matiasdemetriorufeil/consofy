"use server";

import { and, eq, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import postgres from "postgres";
import { z } from "zod";

import { db } from "@/db";
import { buildings } from "@/db/schema";
import { authorizedAction } from "@/lib/auth";

import {
  AR_WHATSAPP_HELP,
  buildingFormSchema,
  CODE_PREFIX_HELP,
  SLUG_HELP,
  updateBuildingFormSchema,
  type BuildingFieldErrors,
  type BuildingFormState,
} from "./building-schema";
import { findBuildingByCodePrefix, getActiveBuildings } from "./queries";
import { SELECTED_BUILDING_COOKIE } from "./selected-building";

// authorizedAction() (src/lib/auth.ts): cambiar el edificio seleccionado
// es una Server Action invocable por HTTP directo como cualquier otra --
// ver CLAUDE.md > Autorización de rutas y Server Actions. Sin esto,
// cualquiera podría setear la cookie a un uuid arbitrario sin haber
// iniciado sesión.
//
// `buildingId: null` representa "Todos los edificios" -- ver CLAUDE.md >
// Selector de edificio activo.
export const setSelectedBuildingAction = authorizedAction(
  async (context, buildingId: string | null) => {
    const store = await cookies();

    if (buildingId === null) {
      store.delete(SELECTED_BUILDING_COOKIE);
      return;
    }

    // Nunca se confía en el id que mandó el cliente sin cruzarlo: valida
    // que sea uno de los edificios ACTIVOS de la organización de quien
    // está autorizado (no cualquier uuid, no uno de otra organización, no
    // uno dado de baja). Si no es válido, no hace nada -- ni error ni
    // cookie corrupta, la misma lógica de "silenciosamente cae a todos los
    // edificios" que ya aplica resolveSelectedBuilding() en lectura.
    const activeBuildings = await getActiveBuildings(context.organization.id);
    const isValid = activeBuildings.some(
      (building) => building.id === buildingId,
    );
    if (!isValid) {
      return;
    }

    store.set(SELECTED_BUILDING_COOKIE, buildingId, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/panel",
      maxAge: 60 * 60 * 24 * 365,
    });
  },
);

// Invalida, después de cada mutación de edificios (paso 4.1, punto 6):
// - "/panel/buildings": el listado de gestión en sí.
// - "/panel/buildings/[buildingId]" con type "layout": paso 4.2 -- el
//   patrón LITERAL con corchetes revalida el layout del segmento dinámico
//   para CUALQUIER buildingId, no uno puntual (no tenemos el id acá adentro
//   de todas formas: createBuildingAction ni siquiera tiene uno todavía).
//   Sin esto, editar un edificio desde su propia vista de detalle (el
//   encabezado reutiliza este mismo BuildingFormDialog) dejaría el
//   encabezado desactualizado hasta un reload manual -- el layout que lo
//   renderiza no se vuelve a ejecutar solo porque el listado se revalidó.
// - "/panel" con type "layout": revalida TODO lo que cuelga del layout de
//   /panel, incluido el selector de edificio del header (que vive en ese
//   layout, ver src/app/panel/layout.tsx) y el dashboard de inicio (que
//   también decide su vacío real a partir de getActiveBuildings()). Ver la
//   documentación de Next.js sobre revalidatePath(path, "layout").
//
// Se llama desde dentro de una Server Action invocada por un Client
// Component ya montado en /panel/buildings o en /panel/buildings/[id] --
// Next.js re-renderiza esa ruta con los datos frescos apenas la Server
// Action termina, sin que el cliente tenga que recargar ni navegar a mano.
function revalidateBuildingPaths() {
  revalidatePath("/panel/buildings");
  revalidatePath("/panel/buildings/[buildingId]", "layout");
  revalidatePath("/panel", "layout");
}

function zodIssuesToFieldErrors(error: z.ZodError): BuildingFieldErrors {
  const fieldErrors: BuildingFieldErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !(field in fieldErrors)) {
      fieldErrors[field as keyof BuildingFieldErrors] = issue.message;
    }
  }
  return fieldErrors;
}

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";

// Traduce los errores de Postgres que puede tirar un INSERT/UPDATE de
// buildings a mensajes de campo entendibles (paso 4.1, punto 5) -- nunca se
// devuelve el error crudo de la base. Cubre dos formas de llegar al mismo
// problema:
// - Los CHECK de formato (slug, prefijo, teléfono) ya los filtra Zod antes
//   de llegar acá en el uso normal, pero la base es la última línea de
//   defensa real (ver CLAUDE.md > Reglas de seguridad) -- si algún día un
//   valor los esquiva, el mensaje sigue siendo el mismo texto de ayuda que
//   ya usa Zod, no un error de Postgres.
// - Los UNIQUE parciales (slug, code_prefix) SÍ se pueden disparar en uso
//   normal: dos pestañas guardando a la vez, o una carrera con el chequeo
//   en vivo del prefijo (checkCodePrefixAvailableAction) que ya pasó pero
//   alguien más guardó ese prefijo en el medio.
//
// `codePrefix`/`excludeBuildingId`: solo hacen falta para el caso de
// prefijo duplicado, para poder buscar y nombrar a quién ya lo usa (pedido
// explícito del paso: "mencionando cuál lo usa").
async function translateBuildingError(
  error: unknown,
  organizationId: string,
  codePrefix?: string,
  excludeBuildingId?: string,
): Promise<BuildingFormState> {
  if (error instanceof postgres.PostgresError) {
    if (error.code === UNIQUE_VIOLATION) {
      if (error.constraint_name === "buildings_organization_id_slug_unique") {
        return {
          ok: false,
          formError: null,
          fieldErrors: { slug: "Ya tenés un edificio con ese nombre." },
        };
      }
      if (
        error.constraint_name === "buildings_organization_id_code_prefix_unique"
      ) {
        const conflict = codePrefix
          ? await findBuildingByCodePrefix(
              organizationId,
              codePrefix,
              excludeBuildingId,
            )
          : null;
        return {
          ok: false,
          formError: null,
          fieldErrors: {
            codePrefix: conflict
              ? `Ese prefijo ya lo usa "${conflict.name}".`
              : "Ese prefijo ya está en uso.",
          },
        };
      }
    }

    if (error.code === CHECK_VIOLATION) {
      if (error.constraint_name === "buildings_slug_format") {
        return { ok: false, formError: null, fieldErrors: { slug: SLUG_HELP } };
      }
      if (error.constraint_name === "buildings_code_prefix_format") {
        return {
          ok: false,
          formError: null,
          fieldErrors: { codePrefix: CODE_PREFIX_HELP },
        };
      }
      if (error.constraint_name === "buildings_admin_whatsapp_e164_format") {
        return {
          ok: false,
          formError: null,
          fieldErrors: { adminWhatsappE164: AR_WHATSAPP_HELP },
        };
      }
    }
  }

  return {
    ok: false,
    formError: "No pudimos guardar el edificio. Probá de nuevo en un momento.",
    fieldErrors: {},
  };
}

// useActionState en el cliente llama a esto como (prevState, input) -- ver
// BuildingForm. `authorizedAction()` inyecta el contexto autorizado como
// primer argumento (ver CLAUDE.md > Autorización de rutas y Server
// Actions): sin esto, cualquiera podría invocar este endpoint por HTTP
// directo y crear un edificio en cualquier organización.
export const createBuildingAction = authorizedAction(
  async (
    context,
    _prevState: BuildingFormState,
    input: unknown,
  ): Promise<BuildingFormState> => {
    const parsed = buildingFormSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        formError: null,
        fieldErrors: zodIssuesToFieldErrors(parsed.error),
      };
    }

    try {
      await db.insert(buildings).values({
        organizationId: context.organization.id,
        ...parsed.data,
      });
    } catch (error) {
      return translateBuildingError(
        error,
        context.organization.id,
        parsed.data.codePrefix,
      );
    }

    revalidateBuildingPaths();
    return { ok: true, formError: null, fieldErrors: {} };
  },
);

export const updateBuildingAction = authorizedAction(
  async (
    context,
    _prevState: BuildingFormState,
    input: unknown,
  ): Promise<BuildingFormState> => {
    const parsed = updateBuildingFormSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        formError: null,
        fieldErrors: zodIssuesToFieldErrors(parsed.error),
      };
    }

    const { id, ...values } = parsed.data;
    let updated: { id: string } | undefined;
    try {
      [updated] = await db
        .update(buildings)
        .set(values)
        .where(
          and(
            eq(buildings.id, id),
            eq(buildings.organizationId, context.organization.id),
            isNull(buildings.deletedAt),
          ),
        )
        .returning({ id: buildings.id });
    } catch (error) {
      return translateBuildingError(
        error,
        context.organization.id,
        values.codePrefix,
        id,
      );
    }

    if (!updated) {
      return {
        ok: false,
        formError:
          "No encontramos ese edificio. Puede que ya lo hayan dado de baja.",
        fieldErrors: {},
      };
    }

    revalidateBuildingPaths();
    return { ok: true, formError: null, fieldErrors: {} };
  },
);

export type SimpleActionResult = { ok: boolean; error?: string };

// Baja (soft delete, paso 4.1 punto 4): nunca DELETE físico -- ver CLAUDE.md
// > Convenciones. Deja el edificio fuera de todo listado normal (incluido
// getManagedBuildings(), que ya filtra deleted_at IS NULL), pero no toca
// las unidades ni los reclamos asociados -- siguen existiendo con su
// building_id intacto (la FK es RESTRICT, nunca CASCADE), solo dejan de
// tener un edificio "vivo" que aparezca en listados nuevos. El diálogo que
// llama a esto (DeleteBuildingDialog) es responsable de explicar eso ANTES
// de confirmar -- esta action no vuelve a chequear reclamos pendientes: ya
// los mostró el diálogo con los datos que ya tenía la fila del listado, sin
// otra consulta.
export const softDeleteBuildingAction = authorizedAction(
  async (context, buildingId: string): Promise<SimpleActionResult> => {
    const parsed = z.uuid().safeParse(buildingId);
    if (!parsed.success) {
      return { ok: false, error: "Edificio inválido." };
    }

    const [updated] = await db
      .update(buildings)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(buildings.id, parsed.data),
          eq(buildings.organizationId, context.organization.id),
          isNull(buildings.deletedAt),
        ),
      )
      .returning({ id: buildings.id });

    if (!updated) {
      return { ok: false, error: "No encontramos ese edificio." };
    }

    revalidateBuildingPaths();
    return { ok: true };
  },
);

// Activar/desactivar (paso 4.1 punto 4): distinto de la baja -- ver
// CLAUDE.md > Acceso a datos sobre la distinción deleted_at/active. Un
// edificio desactivado sigue en getManagedBuildings() (marcado), pero sale
// de getActiveBuildings() (selector del header, formulario público) -- no
// se le puede cargar nada nuevo, pero su historial sigue entero.
export const setBuildingActiveAction = authorizedAction(
  async (
    context,
    buildingId: string,
    active: boolean,
  ): Promise<SimpleActionResult> => {
    const parsed = z.uuid().safeParse(buildingId);
    if (!parsed.success) {
      return { ok: false, error: "Edificio inválido." };
    }

    const [updated] = await db
      .update(buildings)
      .set({ active })
      .where(
        and(
          eq(buildings.id, parsed.data),
          eq(buildings.organizationId, context.organization.id),
          isNull(buildings.deletedAt),
        ),
      )
      .returning({ id: buildings.id });

    if (!updated) {
      return { ok: false, error: "No encontramos ese edificio." };
    }

    revalidateBuildingPaths();
    return { ok: true };
  },
);

export type CodePrefixAvailability = { available: boolean; usedBy?: string };

// Validación en vivo del prefijo (paso 4.1, punto 2), llamada con debounce
// desde BuildingForm mientras la persona escribe. No es la defensa real
// contra un prefijo duplicado -- esa es el índice único parcial de la base,
// traducido en translateBuildingError() más arriba para el caso de
// carrera (dos pestañas, o alguien más guardando el mismo prefijo entre
// que este chequeo corrió y que se envió el formulario). Esto es solo
// feedback temprano para no llegar al submit con un error evitable.
export const checkCodePrefixAvailableAction = authorizedAction(
  async (
    context,
    codePrefix: string,
    excludeBuildingId?: string,
  ): Promise<CodePrefixAvailability> => {
    const parsed = z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2,4}$/)
      .safeParse(codePrefix);
    if (!parsed.success) {
      // Formato todavía inválido (por ejemplo, mientras la persona sigue
      // escribiendo) -- no es un conflicto de unicidad, así que no hay
      // nada que reportar acá. El regex de campo de BuildingForm ya se
      // encarga de avisar el problema de formato.
      return { available: true };
    }

    const conflict = await findBuildingByCodePrefix(
      context.organization.id,
      parsed.data,
      excludeBuildingId,
    );

    return conflict
      ? { available: false, usedBy: conflict.name }
      : { available: true };
  },
);
