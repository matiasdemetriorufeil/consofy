import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { healthCheck } from "@/db/schema";
import { requireUser } from "@/lib/auth";

// TEMPORAL -- medición puntual del pooler de transacciones (6543) desde
// iad1, pedida explícitamente para comparar contra los ~170ms medidos en
// desarrollo (pooler de sesión, 5432, desde Córdoba). Se saca del repo
// apenas se toma la medición, no queda como parte permanente de la app.
//
// Protegida con requireUser() (no pública) -- mismo patrón que el Route
// Handler de descarga del QR (paso 4.6): un Route Handler es un endpoint
// HTTP invocable directo, sin pasar por ningún layout, así que resuelve su
// propia autorización acá.
export async function GET() {
  await requireUser();

  // 1. SELECT 1 suelto -- costo puro de ida y vuelta, sin trabajo real.
  let t0 = Date.now();
  await db.execute(sql`select 1`);
  const selectOnlyMs = Date.now() - t0;

  // 2. BEGIN + SELECT 1 + COMMIT -- mismo select, dentro de una transacción
  // explícita, para ver el costo agregado de abrir/cerrar transacción.
  t0 = Date.now();
  await db.transaction(async (tx) => {
    await tx.execute(sql`select 1`);
  });
  const transactionSelectMs = Date.now() - t0;

  // 3. INSERT real sobre health_check (tabla canario, sin uso de negocio),
  // con ROLLBACK explícito -- ejecuta el INSERT de verdad (WAL, índices)
  // pero no deja ninguna fila.
  t0 = Date.now();
  await db
    .transaction(async (tx) => {
      await tx.insert(healthCheck).values({});
      throw new Error("rollback intencional, no es un error real");
    })
    .catch(() => {});
  const insertRealMs = Date.now() - t0;

  return NextResponse.json({
    selectOnlyMs,
    transactionSelectMs,
    insertRealMs,
    region: process.env.VERCEL_REGION ?? null,
  });
}
