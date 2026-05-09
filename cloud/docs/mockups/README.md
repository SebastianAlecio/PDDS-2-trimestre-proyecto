# Mockups · Entrega 1

Wireframes *low-fi* en HTML estático que ilustran las pantallas principales del **Sistema de Gestión de Incidentes de Producción**. Cada archivo es autocontenido (HTML + un único `styles.css` compartido) y se abre directamente en el navegador.

## Cómo verlos

```bash
# Desde la raíz del repo:
open cloud/docs/mockups/01-dashboard-oncall.html
# o, en Linux:
xdg-open cloud/docs/mockups/01-dashboard-oncall.html
```

## Índice

| # | Archivo | Pantalla | User stories cubiertas |
|---|---|---|---|
| 01 | [`01-dashboard-oncall.html`](01-dashboard-oncall.html)   | Dashboard del *on-call* (incidentes activos asignados, pendiente de reconocer, actividad del equipo) | **US-01**, **US-03** |
| 02 | [`02-incident-detail.html`](02-incident-detail.html)     | Detalle del incidente con *timeline* en vivo, war room, adjuntos, escalation status | **US-02**, **US-08** |
| 03 | [`03-create-incident.html`](03-create-incident.html)     | Form de declaración manual de incidente (con severidad auto-sugerida y notificaciones configurables) | (alternativa a US-07; ejercita F1, F2) |
| 04 | [`04-status-page.html`](04-status-page.html)             | Status page pública (vista del cliente, sin autenticación) | **US-04** |
| 05 | [`05-services-metrics.html`](05-services-metrics.html)   | Servicios con MTTR/MTTA, SLO compliance, distribución de severidades | **US-06** |
| 06 | [`06-postmortem.html`](06-postmortem.html)               | Postmortem auto-generado a partir del *timeline* (draft editable) | **US-05** |
| 07 | [`07-manager-overview.html`](07-manager-overview.html)   | Vista del Engineering Manager con alarmas, escalamientos activos, postmortems pendientes | **US-06**, **US-03** (lado manager) |

## Convenciones del wireframe

- **Estilo intencionalmente sobrio.** Grises, bordes, badges con color sólo donde aporta semántica (severidad SEV1–4, estados de incidente, estados de componente). No representa el diseño visual final.
- **Tipografía:** sans-serif del sistema (sin web fonts).
- **Datos ficticios consistentes.** El incidente recurrente `INC-2026-05-104` (Login latency en `auth-service`) atraviesa varios mockups para mostrar el flujo completo: detección → timeline → status page → postmortem.
- **Personas ficticias:** Sebastián A. (on-call primario), Camila R. (manager), Federico L. (backup), Daniela P. (team-storage).
- **Empresa ficticia:** "Acme" — equipo de SRE de un SaaS B2B.

## Por qué HTML y no Figma / imágenes

- **Reproducible y commiteable** — cualquier integrante puede abrir, editar el HTML y ver el cambio sin software adicional.
- **Defendible como *low-fi*** — el rubric (página 9) pide "mockups *low-fi*"; el estilo wireframe deja claro que no es producto final.
- **Sin dependencias externas** — no se rompe si una herramienta cambia de plan o expira un link.
- **Iterable rápido** — cambiar texto o estructura es directo, sin re-exportar.

## Limitaciones reconocidas

- No son responsive (ancho fijo ~1200px) — la app real será responsive, pero esto es un mockup *low-fi* desktop.
- Algunos elementos están simulados con texto/colores y no son interactivos (selects, botones, charts).
- El gráfico de MTTR en `05-services-metrics.html` usa barras CSS estáticas, no datos reales.
