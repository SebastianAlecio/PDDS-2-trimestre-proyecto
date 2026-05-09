# Entrega 1 — Cloud Infra · Resumen

> **Curso:** Infraestructura en la Nube · ciclo Mayo–Junio 2026
> **Fecha de entrega:** dom 10 may 2026, 23:55 (fin de Semana 2)
> **Puntaje:** 10 puntos
> **Equipo:** Sebastián Alecio · *(integrante 2)* · *(integrante 3)*

## Qué incluye esta entrega

Documento de diseño de **producto y scope** para un sistema de **gestión de incidentes de producción** orientado a equipos SRE/DevOps. La entrega cubre los ítems exigidos por el rubric para E1 (PDF pp. 9–10):

- ✅ Resumen ejecutivo · *Sección 1 de `project.md`*
- ✅ Actores (humanos + sistemas, con actor primario) · *Sección 2*
- ✅ 8 user stories priorizadas P0/P1/P2 con criterio de éxito · *Sección 3*
- ✅ Funcionalidades específicas (no genéricas) · *Sección 4*
- ✅ 7 mockups *low-fi* en HTML estático · *Sección 5 + `mockups/`*
- ✅ Mapeo funcionalidad → 7 componentes del curso · *Sección 6*
- ✅ Scope (in/out) explícito · *Sección 7*
- ✅ Preguntas abiertas honestas · *Sección 8*
- ✅ Anexo IA con qué pidieron / aceptaron / descartaron · *`anexo-ia.md`*

## Estructura entregada

```
cloud/
├── README.md                                    ← orientación de la carpeta
└── docs/
    ├── project.md                               ← documento maestro (crece E1→E5)
    ├── delivery-1-summary.md                    ← este archivo
    ├── anexo-ia.md                              ← reflexión sobre uso de IA
    └── mockups/
        ├── README.md                            ← índice de mockups
        ├── styles.css                           ← estilo wireframe compartido
        ├── 01-dashboard-oncall.html
        ├── 02-incident-detail.html
        ├── 03-create-incident.html
        ├── 04-status-page.html
        ├── 05-services-metrics.html
        ├── 06-postmortem.html
        └── 07-manager-overview.html
```

## Decisiones clave de esta entrega

1. **Sub-dominio específico:** *gestión de incidentes de producción para SRE/DevOps* (no genérico de "tickets"). Justificación: ejercita los siete componentes del curso de forma natural — el escalamiento automático ejercita cómputo asíncrono, el timeline append-heavy ejercita patrones de BD distintos al CRUD, la status page ejercita CDN, los postmortems ejercitan storage de objetos.
2. **Severidad auto-priorizada por reglas declarativas** (SEV1–4) — funcionalidad específica que diferencia del enunciado genérico.
3. **Postmortem auto-generado desde el timeline** — funcionalidad que conecta el flujo operativo con el aprendizaje post-incidente.
4. **Mockups en HTML estático** en lugar de Figma o imágenes — reproducible, commiteable, defendible como *low-fi*.

## Coordinación con curso de Automatización

Esta entrega habilita **D1 del curso de Automatización**, que ya fue entregado el mismo día. Las decisiones de E1 que D1 consumió:

- **Proveedor:** AWS.
- **Región principal:** `us-east-1`.
- **Naming convention:** documentada en `infra/README.md` (otro curso).

No hay incoherencias entre ambas entregas a esta altura.

## Preguntas técnicas abiertas (esperado para E1)

El rubric explícitamente permite que las decisiones técnicas (cómputo, BD, red, async, seguridad) queden abiertas en E1. Las nuestras, listadas en `project.md` §8:

- Cómputo: Lambda vs Fargate vs EC2 *(E2)*
- BD: relacional vs documental para timeline append-heavy *(E2)*
- State machine del incidente: estado explícito vs derivado
- Verificación de webhooks: HMAC compartido vs JWT
- SLO objetivo del propio sistema *(E5)*

## Cómo revisar la entrega

```bash
# Documento principal
open cloud/docs/project.md

# Mockups (abrir en navegador):
open cloud/docs/mockups/01-dashboard-oncall.html
# (o navegar al README de mockups para el índice completo)
open cloud/docs/mockups/README.md

# Anexo IA
open cloud/docs/anexo-ia.md
```

## Pendientes para próximas entregas

- **E2 (jue 21 may):** decisión de cómputo, modelo de datos, decisión BD vs storage de objetos, decisión de caché si aplica, diagrama de contexto.
- **E3 (dom 31 may):** VPC, subnets, AZs, NAT vs VPC endpoints, primera versión del diagrama de contenedores.
- **E4 (dom 7 jun):** flujos asíncronos con DLQ + idempotencia.
- **E5 (jue 11 jun):** seguridad detallada, observabilidad, costos, riesgos, detalle del componente más complejo.
- **Presentación (jue 18 jun):** 20 min de exposición + 10 de preguntas.

## Notas para el equipo

- El **Anexo IA tiene secciones marcadas `[a completar por el equipo]`** — no se entregan vacías. Antes de hacer push, completarlas con honestidad sobre qué editamos / descartamos / aprendimos.
- Los **datos personales del equipo** (nombre completo de los otros integrantes) están como placeholder en `project.md` §encabezado y en este resumen — actualizar antes de la entrega final.
