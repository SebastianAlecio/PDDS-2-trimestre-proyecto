# Proyecto Cloud — PDDS

Repositorio del proyecto integrador del Postgrado en Diseño y Desarrollo de Software (PDDS) de la Universidad Galileo, segundo trimestre. El mismo repositorio sirve a dos cursos:

- **Optimizations and Performance** — define la **automatización del despliegue**: workspace de Terraform y pipeline de CI/CD que provisionan y despliegan toda la arquitectura con un único push a `main`.
- **Infraestructura en la Nube** — define el **diseño de la arquitectura cloud**: los componentes (compute, storage, db, networking, async, security, observability) que se despliegan de forma automatizada.

El objetivo final del proyecto es un pipeline idempotente que, partiendo de cero, levanta la arquitectura completa con un solo `git push origin main`.

## Estructura del repositorio

| Path | Curso | Contenido |
|------|-------|-----------|
| `infra/` | OYD | Workspace raíz de Terraform, módulos, ambientes y documentación técnica |
| `.github/workflows/` | OYD | Definiciones de pipelines de CI/CD |
| `cloud/` | IELN | Workspace raíz con la documentación sobre el proyecto que se desplagará en la infraestructura en la nube |

**Optimización y Desempeño**: La documentación técnica del workspace y el pipeline está en [`infra/README.md`](infra/README.md). Los resúmenes por entrega están en `infra/docs/`. La evidencia de ejecución del CI por entrega vive en cada `infra/docs/delivery-N-summary.md`.

**Infraestructura en la Nube**: La documentación técnica del proyecto se encuentra en [`cloud/README.md`](cloud/README.md). Los resumenes por entrega están en `cloud/docs/`.

## Equipo — Grupo 3

| Nombre | Carnet |
|--------|--------|
| Joaquín Marroquin | 20004254 |
| Alessandro Alecio | 21001224 |
| David García | 2600160 |

Cloud provider: **AWS**, región **`us-east-1`**.
