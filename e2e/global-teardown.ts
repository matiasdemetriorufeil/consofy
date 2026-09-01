import "./helpers/env";

import fs from "node:fs";

import { AUTH_FILE } from "./global-setup";
import { closeDb } from "./helpers/db";
import { deleteTestAdmin } from "./helpers/test-admin";

export default async function globalTeardown(): Promise<void> {
  try {
    if (!fs.existsSync(AUTH_FILE)) {
      console.warn(
        "[global-teardown] No hay archivo de cuenta de prueba -- nada que borrar.",
      );
      return;
    }
    const admin = JSON.parse(fs.readFileSync(AUTH_FILE, "utf8")) as {
      userId: string;
      email: string;
    };
    await deleteTestAdmin(admin.userId);
    fs.rmSync(AUTH_FILE);
    console.log(
      `[global-teardown] Cuenta de prueba borrada por completo (Auth + app_users): ${admin.email}`,
    );
  } finally {
    await closeDb();
  }
}
