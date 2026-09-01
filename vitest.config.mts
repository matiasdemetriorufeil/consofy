import path from "node:path";
import { fileURLToPath } from "node:url";

import { configDefaults, defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// Alias mínimo, calcado del "@/*" -> "./src/*" de tsconfig.json (paths) --
// vitest no lee tsconfig paths por su cuenta, así que los tests que
// importen con "@/..." (en vez de rutas relativas) necesitan este mapeo
// para resolver igual que el resto de la app.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src"),
    },
  },
  test: {
    // `e2e/` son specs de Playwright (paso 12.2), no de Vitest -- comparten
    // el sufijo `.spec.ts` pero se corren con `npm run test:e2e`, nunca acá.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
