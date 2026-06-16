// Escenarios del rol agente N1. Storage state pre-autenticado.

import { test, expect } from "@playwright/test";
import { ROUTES } from "./test-data";

test.describe("Flujos del agente", () => {
  test("07 — agente entra a /cola y ve secciones 'Sin asignar' y 'Asignados a ti'", async ({
    page,
  }) => {
    await page.goto(ROUTES.queue);
    await expect(page.getByRole("heading", { name: "Cola del agente" })).toBeVisible();
    // Las 2 cards del QueueSection.
    await expect(page.getByText("Sin asignar", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Asignados a ti", { exact: false }).first()).toBeVisible();
  });

  test("08 — agente clickea ID de un ticket en la cola y abre /agente/ticket/:id", async ({
    page,
  }) => {
    await page.goto(ROUTES.queue);
    // Esperamos a que el useQueue() termine — el botón "Actualizar" cambia
    // de "Cargando…" a "Actualizar" cuando state pasa a "ready". Sin este
    // wait, podemos buscar links antes de que la tabla renderice.
    await expect(page.getByRole("button", { name: "Actualizar" })).toBeVisible({
      timeout: 10000,
    });

    // Los IDs de ticket en /cola son links a /agente/ticket/<uuid>.
    const firstTicketLink = page.locator('a[href^="/agente/ticket/"]').first();
    await firstTicketLink.waitFor({ state: "visible", timeout: 10000 });

    await firstTicketLink.click();
    await page.waitForURL(/\/agente\/ticket\/[a-f0-9-]+$/, { timeout: 10000 });
    // El panel siempre muestra "Volver a la cola" como link de back.
    await expect(page.getByRole("link", { name: /Volver a la cola/i })).toBeVisible();
  });

  test("09 — agente navega a /agente/historial y la página renderiza", async ({ page }) => {
    await page.goto(ROUTES.agentHistory);
    await expect(page.getByRole("heading", { name: "Historial" })).toBeVisible();
    // Aunque no haya tickets, debe haber el card "Cerrados" + el card meta
    // "Cerrados" con el contador.
    await expect(page.getByText("Cerrados").first()).toBeVisible();
  });
});
