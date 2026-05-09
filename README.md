# Proyecto Cloud — PDDS

[![Terraform CI](https://github.com/dacaslles/PDDS-2-trimestre-proyecto/actions/workflows/terraform-ci.yml/badge.svg)](https://github.com/dacaslles/PDDS-2-trimestre-proyecto/actions/workflows/terraform-ci.yml)

Repositorio del proyecto integrador del Postgrado en Diseño y Desarrollo de Software (PDDS) de la Universidad Galileo, segundo trimestre. El mismo repositorio sirve a dos cursos:

- **Optimizations and Performance** — define la **automatización del despliegue**: workspace de Terraform y pipeline de CI/CD que provisionan y despliegan toda la arquitectura con un único push a `main`.
- **Infraestructura en la Nube** — define el **diseño de la arquitectura cloud**: los componentes (compute, storage, db, networking, async, security, observability) que se despliegan de forma automatizada.

El objetivo final del proyecto es un pipeline idempotente que, partiendo de cero, levanta la arquitectura completa con un solo `git push origin main`.

## Estructura del repositorio

| Path | Curso | Contenido |
|------|-------|-----------|
| `infra/` | OYD | Workspace raíz de Terraform, módulos, ambientes y documentación técnica |
| `.github/workflows/` | OYD | Definiciones de pipelines de CI/CD |

La documentación técnica del workspace y el pipeline está en [`infra/README.md`](infra/README.md). Los resúmenes por entrega están en `infra/docs/`.

## Estado del CI

El workflow `Terraform CI` corre en cada PR contra `main` con la cadena `fmt → init → validate → plan → comment`. Cualquier exit code distinto de cero en los pasos de validación bloquea el merge.

**Evidencia de ejecución exitosa — Delivery 1 smoke test:**

| Item | Resultado |
|------|-----------|
| Workflow run | [#25609174941](https://github.com/dacaslles/PDDS-2-trimestre-proyecto/actions/runs/25609174941) — completado en 18s |
| Pull request | [#1](https://github.com/dacaslles/PDDS-2-trimestre-proyecto/pull/1) — incluye comentario automático con el plan colapsable |
| Commit auditado | `850fded` (mismo al que apunta el tag `oyd-delivery-1`) |

| Step | Resultado |
|------|:---------:|
| `actions/checkout@v4` | ✅ |
| `hashicorp/setup-terraform@v3` | ✅ |
| `aws-actions/configure-aws-credentials@v4` | ✅ |
| `terraform fmt -check -recursive` | ✅ |
| `terraform init -backend=false` | ✅ |
| `terraform validate` | ✅ |
| `terraform plan -var-file=envs/dev/dev.tfvars` | ✅ |
| Post plan as PR comment | ✅ |

El badge en la cabecera de este README refleja el estado del último run del workflow `terraform-ci.yml` y se actualiza automáticamente.

## Equipo — Grupo 3

| Nombre | Carnet |
|--------|--------|
| Joaquín Marroquin | 20004254 |
| Alessandro Alecio | 21001224 |
| David García | 2600160 |

Cloud provider: **AWS**, región **`us-east-1`**.
