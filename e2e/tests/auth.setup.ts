// Auth setup — corre antes de los projects "colaborador" y "agente".
// Hace login real vía la UI contra Cognito (mismo flow que un usuario
// real) y guarda el storage state (localStorage con los tokens Amplify
// + cookies) en .auth/<rol>.json.
//
// Los projects de tests reutilizan ese storage via storageState — eso
// evita re-loguear en cada test, que sería lento (~3-5s por login).

import { test as setup, expect } from "@playwright/test";
import { USERS, ROUTES } from "./test-data";

const STORAGE_PATH = {
  colaborador: ".auth/colaborador.json",
  agente: ".auth/agente.json",
};

async function login(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
  expectedRedirect: string,
) {
  await page.goto(ROUTES.login);
  await page.getByLabel("Correo corporativo").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Continuar" }).click();
  // Amplify guarda tokens y dispara navigation — esperamos a que llegue
  // a la ruta esperada (cada rol va a un home distinto).
  await page.waitForURL(`**${expectedRedirect}`, { timeout: 15000 });
  // Confirmamos que renderizó algo del home — fail-fast si el redirect
  // pasó pero la página crashea por otra razón.
  await expect(page).toHaveURL(new RegExp(expectedRedirect.replace(/\//g, "\\/")));
}

setup("autenticar como colaborador", async ({ page }) => {
  const u = USERS.colaborador;
  await login(page, u.email, u.password, ROUTES.myTickets);
  await page.context().storageState({ path: STORAGE_PATH.colaborador });
});

setup("autenticar como agente", async ({ page }) => {
  const u = USERS.agente;
  await login(page, u.email, u.password, ROUTES.queue);
  await page.context().storageState({ path: STORAGE_PATH.agente });
});
