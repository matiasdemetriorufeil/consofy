import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { sql } from "./helpers/db";

const AUTH_FILE = path.resolve(process.cwd(), "e2e/.auth/test-admin.json");

// Ticket del seed sobre el que se cambia el estado. Se restaura EXACTO al
// terminar (status + timestamps) y se borran los eventos que el test crea
// -- `ticket_events` es append-only, sin `deleted_at`, así que la limpieza
// ahí es borrado físico de las filas de prueba (mismo criterio que la
// limpieza de PRUEBA115 en CLAUDE.md > Auditoría de la superficie pública).
const SEED_TICKET_CODE = "TC-2026-0002";

type TestAdmin = {
  email: string;
  password: string;
  userId: string;
  displayName: string;
};

let admin: TestAdmin;

test.beforeAll(() => {
  if (!fs.existsSync(AUTH_FILE)) {
    throw new Error(
      `No existe ${AUTH_FILE} -- el globalSetup debería haber creado la cuenta de prueba.`,
    );
  }
  admin = JSON.parse(fs.readFileSync(AUTH_FILE, "utf8")) as TestAdmin;
});

test.describe("Flujo 2 - Gestión desde el panel", () => {
  test("login, bandeja, filtro, detalle y cambio de estado, verificado contra la base", async ({
    page,
  }) => {
    const testStart = new Date();

    const originalRows = await sql<
      {
        id: string;
        status: string;
        priority: string;
        title: string;
        resolved_at: Date | null;
        closed_at: Date | null;
      }[]
    >`
      select id, status, priority, title, resolved_at, closed_at
      from tickets where public_code = ${SEED_TICKET_CODE}
    `;
    expect(originalRows).toHaveLength(1);
    const original = originalRows[0]!;
    // Desde "new" (o "in_progress") la transición a "in_progress"/"resolved"
    // es válida -- si el seed cambió, el test lo dice en vez de romper raro.
    expect(["new", "in_progress"]).toContain(original.status);
    const ticketId = original.id;

    try {
      // --- LOGIN con la cuenta de prueba creada en el globalSetup ---
      await page.goto("/login");
      await page.locator("#email").fill(admin.email);
      await page.locator("#password").fill(admin.password);
      await page.getByRole("button", { name: "Ingresar" }).click();
      await page.waitForURL(/\/panel(\/|$|\?)/, { timeout: 45_000 });

      // --- BANDEJA + FILTRO ---
      await page.goto("/panel/tickets");
      const search = page.getByRole("searchbox", { name: "Buscar reclamos" });
      await expect(search).toBeVisible();
      await search.fill(SEED_TICKET_CODE);
      await page.waitForURL(new RegExp(`q=${SEED_TICKET_CODE}`), {
        timeout: 20_000,
      });

      const matchingRow = page
        .getByRole("row")
        .filter({ hasText: SEED_TICKET_CODE });
      await expect(matchingRow).toHaveCount(1);
      // El filtro recortó de verdad: no quedan otros códigos de reclamo a la vista.
      await expect(page.getByText("TC-2026-0001")).toHaveCount(0);

      // --- DETALLE ---
      await matchingRow.getByRole("link").first().click();
      await page.waitForURL(new RegExp(`/panel/tickets/${ticketId}`), {
        timeout: 20_000,
      });
      await expect(
        page.getByRole("heading", { name: original.title }),
      ).toBeVisible();

      // --- CAMBIO DE ESTADO (new -> in_progress) ---
      const targetLabel =
        original.status === "new"
          ? "Marcar en progreso"
          : "Marcar como resuelto";
      const targetStatus =
        original.status === "new" ? "in_progress" : "resolved";
      await page.getByRole("button", { name: targetLabel }).click();
      await expect(page.getByText("Estado actualizado.")).toBeVisible({
        timeout: 30_000,
      });

      // La UI refleja el nuevo estado tras el router.refresh().
      const expectedBadge =
        targetStatus === "in_progress" ? "En progreso" : "Resuelto";
      await expect(
        page.getByText(expectedBadge, { exact: true }).first(),
      ).toBeVisible({ timeout: 20_000 });

      // --- Verificación contra la BASE: tabla tickets ---
      const afterRows = await sql<{ status: string }[]>`
        select status from tickets where id = ${ticketId}
      `;
      expect(afterRows[0]!.status).toBe(targetStatus);

      // --- Verificación contra la BASE: ticket_events ---
      const eventRows = await sql<
        {
          type: string;
          actor_type: string;
          actor_label: string;
          payload: { from?: string; to?: string };
        }[]
      >`
        select type, actor_type, actor_label, payload
        from ticket_events
        where ticket_id = ${ticketId}
          and type = 'status_changed'
          and created_at >= ${testStart}
      `;
      expect(eventRows).toHaveLength(1);
      expect(eventRows[0]!.actor_type).toBe("admin");
      expect(eventRows[0]!.actor_label).toBe(admin.displayName);
      expect(eventRows[0]!.payload.from).toBe(original.status);
      expect(eventRows[0]!.payload.to).toBe(targetStatus);
    } finally {
      // --- RESTAURACIÓN EXACTA del ticket del seed ---
      await sql`
        update tickets
        set status = ${original.status},
            resolved_at = ${original.resolved_at},
            closed_at = ${original.closed_at}
        where id = ${ticketId}
      `;
      await sql`
        delete from ticket_events
        where ticket_id = ${ticketId}
          and type = 'status_changed'
          and actor_label = ${admin.displayName}
          and created_at >= ${testStart}
      `;
    }

    const restoredRows = await sql<{ status: string }[]>`
      select status from tickets where id = ${ticketId}
    `;
    expect(restoredRows[0]!.status).toBe(original.status);

    const leftoverEvents = await sql<{ n: number }[]>`
      select count(*)::int as n from ticket_events
      where ticket_id = ${ticketId}
        and type = 'status_changed'
        and created_at >= ${testStart}
    `;
    expect(leftoverEvents[0]!.n).toBe(0);
  });
});
