import "./helpers/env";

import fs from "node:fs";
import path from "node:path";

import { createTestAdmin } from "./helpers/test-admin";

// Escribe las credenciales de la cuenta de prueba en un archivo local
// (gitignoreado) que el spec del flujo 2 lee. El globalTeardown la borra a
// partir del mismo archivo -- corre aunque los tests fallen, siempre que
// este setup haya llegado a terminar.
export const AUTH_FILE = path.resolve(
  process.cwd(),
  "e2e/.auth/test-admin.json",
);

export default async function globalSetup(): Promise<void> {
  // No se cierra el pool de `helpers/db.ts` acá: el globalTeardown corre en
  // el MISMO proceso que este setup y reusa esa misma conexión para borrar
  // la cuenta -- cerrarla acá la dejaría inservible para el teardown. El
  // `idle_timeout` del pool alcanza para que el proceso pueda terminar.
  const admin = await createTestAdmin();
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  fs.writeFileSync(AUTH_FILE, JSON.stringify(admin, null, 2));
  console.log(
    `[global-setup] Cuenta de prueba creada: ${admin.email} (userId=${admin.userId})`,
  );
}
