# Lab 1 — Pruebas para Software · E2E con Playwright

10 escenarios de pruebas automáticas de interfaz gráfica para la app de
tickets Ticke-T (mismo proyecto de Cloud + OYD). Stack:

- **Framework de pruebas**: [Playwright](https://playwright.dev/) (TypeScript)
- **Recorder sugerido**: `npx playwright codegen` (incluido en Playwright)
- **Browser**: Chromium headless

## Escenarios cubiertos

| # | Spec file | Escenario | Rol |
|---|---|---|---|
| 1 | `anon.spec.ts` | Login válido como colaborador redirige a `/mis-tickets` | anon |
| 2 | `anon.spec.ts` | Login con password incorrecta muestra error y NO redirige | anon |
| 3 | `anon.spec.ts` | Acceso a ruta protegida sin auth redirige a `/login` | anon |
| 4 | `colaborador.spec.ts` | Crear ticket con datos válidos navega a `/mis-tickets` + toast | colaborador |
| 5 | `colaborador.spec.ts` | Crear ticket con título vacío bloqueado por validación zod | colaborador |
| 6 | `colaborador.spec.ts` | Logout desde el AppHeader devuelve a `/login` | colaborador |
| 7 | `agente.spec.ts` | Agente entra a `/cola` y ve secciones "Sin asignar" y "Asignados a ti" | agente |
| 8 | `agente.spec.ts` | Agente clickea ticket en la cola y abre `/agente/ticket/:id` | agente |
| 9 | `agente.spec.ts` | Agente navega a `/agente/historial` y la página renderiza | agente |
| 10 | `chat.spec.ts` | Chat widget visible en `/mis-tickets` para colaboradores | colaborador |

## Estructura

```
e2e/
├── playwright.config.ts          # 4 projects (setup/anon/colaborador/agente) con storage state per-rol
├── tests/
│   ├── test-data.ts              # Credenciales + rutas centralizadas
│   ├── auth.setup.ts             # Pre-login con Cognito → guarda .auth/<rol>.json
│   ├── anon.spec.ts              # 3 escenarios sin auth
│   ├── colaborador.spec.ts       # 3 escenarios con storage colaborador
│   ├── agente.spec.ts            # 3 escenarios con storage agente
│   └── chat.spec.ts              # 1 escenario del widget (storage colaborador)
└── .auth/                        # Storage states generados (gitignored)
```

## Estrategia de auth

Tests autenticados reutilizan storage states (cookies + localStorage con
tokens Amplify) generados por `auth.setup.ts`. Eso evita re-loguear en
cada test contra Cognito — el login completo vía Amplify USER_SRP_AUTH
toma ~3-5s y Cognito rate-limita logins por IP.

Cuentas de test en el User Pool `us-east-1_0sgRp2iI0`:

| Email | Password | Rol |
|---|---|---|
| `lab1.colaborador@ticke-t.local` | `Lab1ColabPass2026` | colaborador |
| `lab1.agente@ticke-t.local` | `Lab1AgentePass2026` | agente-n1 |

Ambas tienen `email_verified = true` y password permanente — listas
para usar sin paso de "set new password".

## Cómo correr

```bash
# Prerrequisito: arrancar Vite en otra terminal
cd app && npm run dev

# Desde e2e/:
npm test               # corre todos los tests headless
npm run test:ui        # modo UI interactivo (recomendado para debug)
npm run test:headed    # corre con browser visible
npm run report         # abre el reporte HTML de la última corrida
npm run codegen        # graba interacciones para generar tests nuevos
```

Tests requieren Vite corriendo en `http://localhost:5173` (override con
`PLAYWRIGHT_BASE_URL=https://otro-host npx playwright test` si el frontend
está deployado en otra URL).

## Resultados

Última corrida exitosa: **12 / 12 passed en ~16s** (2 setup + 10 escenarios).
