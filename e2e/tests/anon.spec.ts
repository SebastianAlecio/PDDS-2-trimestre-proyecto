// Escenarios SIN autenticación. Verifican el flow de login y los
// guards de rutas protegidas. Se ejecutan en el project "anon" del
// playwright.config.ts (sin storageState).

import { test, expect } from "@playwright/test";
import { USERS, ROUTES } from "./test-data";

test.describe("Autenticación y guards", () => {
  test("01 — login válido como colaborador redirige a /mis-tickets", async ({ page }) => {
    await page.goto(ROUTES.login);
    await page.getByLabel("Correo corporativo").fill(USERS.colaborador.email);
    await page.getByLabel("Contraseña").fill(USERS.colaborador.password);
    await page.getByRole("button", { name: "Continuar" }).click();

    await page.waitForURL(`**${ROUTES.myTickets}`, { timeout: 15000 });
    await expect(page).toHaveURL(/\/mis-tickets$/);
    // El AppHeader muestra el email del usuario logueado.
    await expect(page.getByText(USERS.colaborador.email)).toBeVisible();
  });

  test("02 — login con password incorrecta muestra error y NO redirige", async ({ page }) => {
    await page.goto(ROUTES.login);
    await page.getByLabel("Correo corporativo").fill(USERS.colaborador.email);
    await page.getByLabel("Contraseña").fill("PasswordIncorrecta123");
    await page.getByRole("button", { name: "Continuar" }).click();

    // Esperamos un mensaje de error (role="alert") y que sigamos en /login.
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/login$/);
  });

  test("03 — acceso a ruta protegida sin auth redirige a /login", async ({ page }) => {
    // /mis-tickets requiere RequireAuth — sin sesión debe redirigir.
    await page.goto(ROUTES.myTickets);
    await page.waitForURL(/\/login/, { timeout: 10000 });
    await expect(page).toHaveURL(/\/login$/);
  });
});
