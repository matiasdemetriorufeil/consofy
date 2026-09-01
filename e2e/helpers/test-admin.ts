import "./env";

import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { getOrganizationId, sql } from "./db";
import { requireEnv } from "./env";

// Cuenta de administrador DESCARTABLE para el flujo 2 (login en el panel).
// Mismo patrón que usó cada etapa del proyecto para verificar rutas
// protegidas: se crea una cuenta dedicada, se reporta cuál es, y se borra
// por completo al terminar (Auth + `app_users`) -- nunca se toca la cuenta
// real ni la del seed (ver CLAUDE.md > Reglas de entorno).
//
// USA LA SERVICE-ROLE KEY de Supabase (Admin API) -- el único uso en esta
// suite, y solo para crear y borrar esta cuenta puntual. Reportado en el
// resumen del paso.
const PREFIX = "prueba-e2e-12-2";

export type TestAdmin = {
  email: string;
  password: string;
  userId: string;
  displayName: string;
};

function adminClient() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function createTestAdmin(): Promise<TestAdmin> {
  const email = `${PREFIX}-${Date.now()}@example.com`;
  const password = `E2e-${randomUUID()}`;
  const displayName = "Prueba E2E 12.2";

  const supabase = adminClient();
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(
      `No se pudo crear el usuario de Auth de prueba: ${error?.message ?? "sin usuario en la respuesta"}`,
    );
  }

  const userId = data.user.id;
  try {
    const organizationId = await getOrganizationId();
    await sql`
      insert into app_users (id, organization_id, display_name, role, email)
      values (${userId}, ${organizationId}, ${displayName}, 'admin', ${email})
    `;
  } catch (insertError) {
    // Si falla el INSERT en app_users, no dejar el usuario de Auth
    // huérfano.
    await supabase.auth.admin.deleteUser(userId).catch(() => {});
    throw insertError;
  }

  return { email, password, userId, displayName };
}

export async function deleteTestAdmin(userId: string): Promise<void> {
  // Borrado FÍSICO a propósito: es una credencial de acceso descartable,
  // no un dato de negocio -- mismo criterio ya fijado en CLAUDE.md >
  // Detección de reclamos repetidos (paso 7.3) para las cuentas de prueba.
  await sql`delete from app_users where id = ${userId}`;
  const { error } = await adminClient().auth.admin.deleteUser(userId);
  if (error) {
    throw new Error(
      `No se pudo borrar el usuario de Auth de prueba (${userId}): ${error.message}`,
    );
  }
}
