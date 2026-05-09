# Cloud Infra · Documento de Proyecto

Espacio de trabajo para el curso **Infraestructura en la Nube** del Postgrado en Diseño y Desarrollo de Software (Galileo, ciclo Mayo–Junio 2026).

> **El curso es 100% de diseño y arquitectura.** No se construye aplicación ni se despliega nada en este curso (rubric, p. 1: *"No se requiere implementación en código ni despliegue real"*). La parte de IaC vive en el otro curso del trimestre, en `../infra/`.

## Estructura

```
cloud/
└── docs/
    ├── project.md            ← documento maestro (crece de E1 a E5)
    ├── delivery-1-summary.md ← resumen E1
    ├── anexo-ia.md           ← reflexión sobre uso de IA
    └── mockups/              ← wireframes low-fi en HTML estático
```

## Iteración por entregas

El proyecto se construye iterativamente: cada entrega agrega una capa de diseño sobre la anterior. **`docs/project.md` es un único documento que crece — no se reescribe.**

| Entrega | Fecha | Lo que agrega | Puntaje |
|---|---|---|---|
| **E1** | dom 10 may 2026 | Producto: problema, casos de uso, mockups, scope | 10 pts |
| E2 | jue 21 may 2026 | Diagrama de contexto · cómputo · datos | 10 pts |
| E3 | dom 31 may 2026 | Red: VPC con separación pública/privada · diagrama de contenedores v1 | 8 pts |
| E4 | dom 7 jun 2026 | Asíncrono: eventos con DLQ + idempotencia | 8 pts |
| E5 | jue 11 jun 2026 | Seguridad · observabilidad · costos · detalle del componente más complejo | 14 pts |
| Presentación | jue 18 jun 2026 | 20 min de exposición + 10 de preguntas | 15 pts |

**Total: 65 puntos.**

## Sub-dominio elegido

**Sistema de gestión de incidentes de producción** (variante específica del enunciado genérico "tickets e incidentes" del rubric). Ver `docs/project.md` §1 para el resumen ejecutivo.

## Cómo revisar el trabajo

```bash
# Doc principal
open cloud/docs/project.md

# Mockups (HTML estático, abrir en navegador):
open cloud/docs/mockups/README.md      # índice
open cloud/docs/mockups/01-dashboard-oncall.html
```

## Coordinación con curso de Automatización

Cada entrega de Cloud Infra alimenta un *Delivery* del curso paralelo de Automatización con IaC, que vive en `../infra/`. Por ejemplo, E1 (este) alimenta D1 (proveedor + naming + región), E2 alimentará D2 (cómputo + BD), etc. Si esta carpeta se desincroniza con `../infra/`, el `delivery-N-summary.md` correspondiente debe documentar el ajuste.

## Convenciones

- **Idioma:** documentación en español; identificadores de código (endpoints, tablas, archivos) en inglés.
- **Commits:** prefijo `[entrega-N-cloud]` (paralelo a `[entrega-N]` que usa el otro curso).
- **Branch:** `cloud-delivery-N` por entrega.
