import path from "node:path";

import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

// Tests e2e de los dos flujos críticos (paso 12.2): alta de reclamo desde
// el formulario público y gestión desde el panel. Corren contra la base de
// DESARROLLO real (nunca un mock) y contra un dev server real -- mismo
// criterio con el que el resto del proyecto verificó cada etapa con
// Playwright a mano, ahora fijado como suite reproducible.
//
// Las variables vienen de `.env.local` (proyecto de desarrollo, ver
// CLAUDE.md > Separación dev/producción) -- `dotenv` acá y también en
// `e2e/helpers/env.ts`, porque los workers de Playwright son procesos
// aparte.
dotenv.config({ path: path.resolve(__dirname, ".env.local") });

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  // Serial y con un solo worker a propósito: los dos flujos tocan la MISMA
  // base de desarrollo compartida (el flujo 2 muta un ticket del seed y lo
  // restaura) -- correrlos en paralelo se pisaría entre sí.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // La latencia a la base de desarrollo (Córdoba <-> us-east-1) es de
  // segundos por round-trip (ver CLAUDE.md > Separación dev/producción), y
  // el alta de un reclamo encadena varias Server Actions -- los timeouts
  // son generosos por ese motivo, no por tests lentos de por sí.
  timeout: 120_000,
  expect: { timeout: 20_000 },
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Reusa el `npm run dev` que ya esté corriendo en :3000; si no hay
  // ninguno, lo levanta. `next dev` no permite una segunda instancia en el
  // mismo directorio, así que reuseExistingServer tiene que quedar en true.
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
