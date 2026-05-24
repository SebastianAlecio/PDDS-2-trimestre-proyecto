# Ticke-T · App (Vite + React 19 + TypeScript)

Aplicación frontend de **Ticke-T**, la plataforma de tickets internos del curso *Infraestructura en la Nube* (PDDS · Universidad Galileo). Esta carpeta contiene la app web; la infraestructura Terraform vive en `../infra/`.

## Estado actual

Primera pantalla en funcionamiento: **Crear ticket** (cubre US-01 del `cloud/docs/project.md`).

- Formulario con secciones *Información básica*, *Solicitante* y *Adjuntos*.
- Validación con `zod` + `react-hook-form`.
- Auto-derivación de `id`, `estado`, `responsable`, `fecha de creación`, `SLA` y `fecha límite` (basado en prioridad).
- Adjuntos: límite de 10 archivos y 25 MB por archivo. Por ahora se persiste solo la metadata (los archivos reales se subirán a S3 cuando el backend exista).
- Persistencia local en `localStorage` bajo la clave `ticke-t:tickets`. La interfaz `TicketRepository` permite reemplazar la implementación por una HTTP/DynamoDB sin tocar la UI.
- Diseño Apple-language con tokens del `design.md` (Action Blue `#0066cc`, hairlines, paleta neutral, pill buttons, Inter).

## Estructura

```
src/
├── main.tsx                      # entry point
├── App.tsx                       # monta CreateTicketPage
├── styles/app.css                # tokens del design.md + reset + globales
├── shared/ui/                    # Field, Select (label + input + a11y)
└── features/tickets/
    ├── domain/                   # tipos + reglas puras (sla, builder, repo interface)
    ├── infrastructure/           # localStorageTicketRepository
    └── presentation/             # CreateTicketPage + schema + hook + CSS module
```

## Comandos

```bash
npm install        # instalar dependencias
npm run dev        # arrancar dev server (http://localhost:5173)
npm run build      # type-check + build de producción a dist/
npm run preview    # servir el build de producción
npm run test       # correr tests con vitest
```

## Cómo inspeccionar los tickets creados

1. Llena el formulario y envíalo.
2. Abre DevTools del navegador → *Application* → *Local Storage* → `http://localhost:5173`.
3. La clave `ticke-t:tickets` contiene el array JSON con todos los tickets creados.
4. El payload de cada ticket es exactamente el shape que se guardará en DynamoDB cuando el backend exista.

## Próximos pasos (no incluidos en esta entrega)

- Login con cuenta corporativa (autocompleta los datos del solicitante).
- Cola del agente, detalle del ticket, escalamiento a N2, métricas.
- Widget de chat embebible.
- Reemplazo de `LocalStorageTicketRepository` por implementación HTTP contra el backend (Lambda + API Gateway + DynamoDB).
- Subida real de adjuntos a S3 con URLs firmadas.
- Cálculo de SLA en calendario hábil (lo evaluará el watchdog server-side).
