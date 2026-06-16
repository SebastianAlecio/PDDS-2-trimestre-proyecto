// Escenarios del chat widget. Usa storage del colaborador.

import { test, expect } from "@playwright/test";
import { ROUTES } from "./test-data";

test.describe("Chat widget", () => {
  test("10 — chat widget está visible en /mis-tickets para colaboradores", async ({ page }) => {
    await page.goto(ROUTES.myTickets);

    // Header del widget — siempre visible para colaboradores signed-in.
    // Puede estar en empty-state ("Sin tickets activos") o lista, ambos
    // muestran "Chat de soporte" en el header.
    await expect(page.getByText("Chat de soporte").first()).toBeVisible({ timeout: 10000 });

    // El botón "Minimizar chat" debe existir (aria-label exacto).
    await expect(page.getByRole("button", { name: "Minimizar chat" })).toBeVisible();
  });
});
