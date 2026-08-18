import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/lib/env";

import * as schema from "@/db/schema";

// Pool DEDICADO, chico, solo para la escritura paralela de la importación
// CSV (paso 4.5, entrega 3) -- separado del cliente global de
// src/db/index.ts (`max: 1`) a propósito: subir el `max` del cliente
// global afectaría a TODA request de la app (cada instancia serverless
// abriría más conexiones por cada visita al panel, no solo durante un
// import), para una operación puntual y poco frecuente (un administrador
// importando un CSV). Un pool aparte acota el costo extra a exactamente
// cuando se está escribiendo un import, nunca antes ni después.
//
// `max: 8`, medido contra el pooler real de desarrollo (puerto 5432,
// sesión), no elegido a ojo: ese pooler tiene un límite DURO de 15
// clientes simultáneos (`pool_size`) -- confirmado provocando el error
// real "(EMAXCONNSESSION) max clients reached in session mode" al pasar de
// 15. Con 8 conexiones en paralelo, 60 INSERT reales bajaron de 730ms/fila
// (secuencial, max:1) a 108.7ms/fila efectivo -- ya casi todo el
// beneficio disponible (8→12 solo ganaba ~31% más velocidad por 50% más
// conexiones, contra un techo compartido con el resto de la app). 8 deja
// 7 conexiones de margen bajo ese límite de 15 para todo lo demás que la
// app pueda estar sirviendo al mismo tiempo.
//
// El límite real en producción (pooler de TRANSACCIONES, puerto 6543) SÍ
// se midió después (medición contra producción): rampa de conexiones
// concurrentes de 1 a 80 contra 6543, sin un solo error ni señal de cola
// -- no se encontró el techo, solo se confirmó que está en ≥80 (5x el de
// sesión). Con ese margen, y con el import de 500 filas ya corriendo en
// 9.7s en producción (contra el criterio de aceptación de 5 minutos), NO
// se subió este número: el paralelismo actual ya no es el cuello de
// botella, y subirlo solo gastaría margen de un techo que sigue sin
// medirse con exactitud a cambio de unos segundos menos en un import que
// ya sobra de rápido.
const IMPORT_WRITE_POOL_MAX = 8;

const globalForImportsDb = globalThis as unknown as {
  importsQueryClient?: postgres.Sql;
};

const importsQueryClient =
  globalForImportsDb.importsQueryClient ??
  postgres(env.DATABASE_URL, {
    prepare: false,
    max: IMPORT_WRITE_POOL_MAX,
    idle_timeout: 20,
    connect_timeout: 10,
  });

if (process.env.NODE_ENV !== "production") {
  globalForImportsDb.importsQueryClient = importsQueryClient;
}

export const importsDb = drizzle({ client: importsQueryClient, schema });
