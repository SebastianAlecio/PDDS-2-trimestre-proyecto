// Escenarios del rol colaborador. Reutilizan el storageState guardado
// por auth.setup.ts → no re-loguean por test, solo navegan.

import { test, expect } from "@playwright/test";
import { USERS, ROUTES } from "./test-data";

test.describe("Flujos del colaborador", () => {
  test("04 — crear ticket con datos válidos navega a /mis-tickets y muestra toast", async ({
    page,
  }) => {
    await page.goto(ROUTES.create);
    await expect(page.getByRole("heading", { name: "Crear ticket" })).toBeVisible();

    const uniqueTitle = `E2E ticket ${Date.now()}`;
    await page.getByLabel("Título").fill(uniqueTitle);
    await page.getByLabel("Categoría").selectOption("incidente");
    await page.getByLabel("Área del ticket").selectOption("IT");
    await page.getByLabel("Prioridad").selectOption("baja");
    await page.getByLabel("Área del solicitante").fill("Pruebas E2E");
    await page
      .getByLabel("Descripción")
      .fill("Ticket creado automáticamente por Playwright para el lab1 de pruebas.");

    await page.getByRole("button", { name: "Crear ticket" }).click();

    // Tras submit exitoso: setActiveTicketId + navigate("/mis-tickets")
    await page.waitForURL(/\/mis-tickets$/, { timeout: 20000 });
    // El toast con el shortId del ticket debería estar visible (role status).
    await expect(page.getByRole("status").filter({ hasText: /TKT-/ })).toBeVisible({
      timeout: 10000,
    });
  });

  test("05 — crear ticket con título vacío deja submit bloqueado por validación zod", async ({
    page,
  }) => {
    await page.goto(ROUTES.create);
    await page.getByLabel("Categoría").selectOption("incidente");
    await page.getByLabel("Área del ticket").selectOption("IT");
    await page.getByLabel("Prioridad").selectOption("media");
    await page.getByLabel("Área del solicitante").fill("Pruebas");
    await page.getByLabel("Descripción").fill("Sin título a propósito para test de validación.");

    await page.getByRole("button", { name: "Crear ticket" }).click();

    // El schema zod (CreateTicketFormValues) marca title como required.
    // El form NO debe navegar — sigue en /crear. Mostramos espera corta y
    // verificamos que no hubo navegación.
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/crear$/);
  });

  test("06 — logout desde el AppHeader devuelve a /login", async ({ page }) => {
    await page.goto(ROUTES.myTickets);
    // El AppHeader tiene un botón "Cerrar sesión" — Amplify limpia los
    // tokens y RequireAuth dispara redirect a /login.
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await page.waitForURL(/\/login$/, { timeout: 10000 });
    await expect(page).toHaveURL(/\/login$/);
  });
});
