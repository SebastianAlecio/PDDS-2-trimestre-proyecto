import { defineConfig, devices } from "@playwright/test";

// Configuración base para los E2E del proyecto Ticke-T (Lab 1 — Pruebas
// para Software). 10 escenarios distribuidos en 4 spec files + 1 setup
// que pre-autentica con Cognito.
//
// Estrategia de auth: tests que necesitan estar logueados (colaborador
// o agente) reutilizan storage states pre-generados por auth.setup.ts.
// Eso evita re-loguear en cada test (Cognito rate-limita y los logins
// vía Amplify USER_SRP_AUTH son ~3-5s cada uno).
//
// baseURL apunta a Vite local — los tests requieren `npm run dev` en
// app/ corriendo en otra terminal antes de ejecutarse.

export default defineConfig({
  testDir: "./tests",
  // Tests autenticados pueden chocar entre sí si modifican el mismo
  // ticket — corremos en serie por safety. Si más adelante hay tests
  // independientes, podés subir workers > 1.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["html", { open: "never" }], ["list"]],

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    // Setup project — corre primero y deja .auth/<rol>.json en disk.
    {
      name: "setup",
      testMatch: "auth.setup.ts",
    },

    // Tests del rol colaborador — incluye flows del CRUD + el widget de
    // chat, que también requiere colaborador signed-in.
    {
      name: "colaborador",
      testMatch: ["colaborador.spec.ts", "chat.spec.ts"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: ".auth/colaborador.json",
      },
      dependencies: ["setup"],
    },

    // Tests del rol agente N1 — cola, panel de ticket, historial.
    {
      name: "agente",
      testMatch: "agente.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        storageState: ".auth/agente.json",
      },
      dependencies: ["setup"],
    },

    // Tests sin auth — login flow + redirects.
    {
      name: "anon",
      testMatch: "anon.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
