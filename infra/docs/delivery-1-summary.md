# Resumen Delivery 1 — IaC Workspace Bootstrap & CI Pipeline

**Curso:** Optimizations and Performance (PDDS, Galileo)
**Selección de track:** Estándar (sin EKS) · CI = GitHub Actions (sin proveedor de CI externo)
**Tag de entrega:** `oyd-delivery-1`

## 1. Cloud provider y región

Seleccionamos **AWS** en la región **`us-east-1`**.

Justificación:

- AWS ofrece el catálogo de servicios más amplio para los siete componentes requeridos en deliveries posteriores (EC2/Lambda/Fargate, S3, RDS/DynamoDB, VPC, SQS/SNS/EventBridge, IAM/Secrets/KMS, CloudWatch). Los equivalentes en GCP existen, pero el mapeo uno-a-uno con la consigna es más directo en AWS.
- `us-east-1` es la región default para servicios nuevos de AWS y la más barata para la mayoría de SKUs de storage y networking. La latencia desde Ciudad de Guatemala hasta `us-east-1` es aceptable (≈70ms p50) y el equipo ya tiene experiencia previa en esa región.
- La cobertura de free tier es la más amplia en `us-east-1`, lo que mantiene el costo de experimentación cercano a cero hasta Delivery 5.

## 2. Recurso provisionado

Provisionamos un único bucket S3 con hardening ya aplicado: versioning, server-side encryption (SSE-S3) y bloqueo total de acceso público. El recurso vive en `infra/main.tf` y está compuesto por cinco resources que comparten el mismo nombre lógico:

| Resource | Propósito |
|----------|-----------|
| `aws_s3_bucket.bootstrap` | El bucket en sí, nombrado `${prefix}-${env}-${random_hex}` |
| `aws_s3_bucket_versioning.bootstrap` | Versioning habilitado |
| `aws_s3_bucket_server_side_encryption_configuration.bootstrap` | AES256 en reposo |
| `aws_s3_bucket_public_access_block.bootstrap` | Los cuatro switches de bloqueo público activados |
| `random_id.bucket_suffix` | Sufijo de 4 bytes para garantizar unicidad global |

**Por qué este recurso como prueba de concepto:** ejercita todo el cableado provider/credenciales/variables (la región viene de `var.region`, el nombre se compone con `var.bucket_name_prefix` + `var.environment` + un sufijo random, los tags por default vienen del bloque del provider) sin tocar networking ni compute, que llegan en deliveries posteriores. Además, sirve como base directa para el backend remoto del state en Delivery 2 — cero re-trabajo cuando promovemos esa pieza.

**Excerpt representativo de `terraform plan`** (output completo capturado en `docs/plan-delivery-1.txt`):

```hcl
Terraform will perform the following actions:

  # aws_s3_bucket.bootstrap will be created
  + resource "aws_s3_bucket" "bootstrap" {
      + bucket               = (known after apply)
      + arn                  = (known after apply)
      + force_destroy        = false
      + tags_all             = {
          + "Environment" = "dev"
          + "ManagedBy"   = "Terraform"
          + "Project"     = "pdds-oyd"
        }
    }

  # aws_s3_bucket_public_access_block.bootstrap will be created
  + resource "aws_s3_bucket_public_access_block" "bootstrap" {
      + block_public_acls       = true
      + block_public_policy     = true
      + ignore_public_acls      = true
      + restrict_public_buckets = true
    }

  # aws_s3_bucket_server_side_encryption_configuration.bootstrap will be created
  + resource "aws_s3_bucket_server_side_encryption_configuration" "bootstrap" {
      + rule {
          + apply_server_side_encryption_by_default {
              + sse_algorithm = "AES256"
            }
        }
    }

  # aws_s3_bucket_versioning.bootstrap will be created
  + resource "aws_s3_bucket_versioning" "bootstrap" {
      + versioning_configuration {
          + status = "Enabled"
        }
    }

  # random_id.bucket_suffix will be created
  + resource "random_id" "bucket_suffix" {
      + byte_length = 4
      + hex         = (known after apply)
    }

Plan: 5 to add, 0 to change, 0 to destroy.
```

## 3. Arquitectura del pipeline de CI

`.github/workflows/terraform-ci.yml` corre en cada PR contra `main`. El job es una secuencia lineal: la falla de cualquiera de los primeros pasos bloquea el PR check; el último paso (comentario en el PR) es no bloqueante por diseño.

| # | Step | Propósito |
|---|------|-----------|
| 1 | `actions/checkout@v4` | Hace fetch del head commit del PR |
| 2 | `hashicorp/setup-terraform@v3` | Instala Terraform `~> 1.8` con `terraform_wrapper: false` para controlar la captura del output del plan |
| 3 | `aws-actions/configure-aws-credentials@v4` | Exporta las AWS credentials desde los secrets al ambiente del runner |
| 4 | `terraform fmt -check -recursive` | Detecta drift de estilo HCL |
| 5 | `terraform init -backend=false` | Resuelve versiones de provider de forma determinística desde `.terraform.lock.hcl` |
| 6 | `terraform validate` | Análisis estático del grafo |
| 7 | `terraform plan -var-file=envs/dev/dev.tfvars -no-color -input=false 2>&1 \| tee plan.txt` | Plan real con el output capturado a archivo |
| 8 | `actions/github-script@v7` que postea `plan.txt` como comentario colapsable | Visibilidad para el reviewer; `continue-on-error: true` para que un fallo en el comentario no invalide el PR check |

**Estrategia de credenciales:** las AWS access keys se guardan como GitHub Actions secrets cifrados (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`) y se inyectan únicamente en el step de configuración de credenciales. Nunca aparecen en YAML, ni en HCL, ni en el repositorio. La federación OIDC reemplazará estas llaves de larga vida en Delivery 5 (según §3.1.2).

`permissions:` está scopeado al mínimo: `contents: read` para el checkout, `pull-requests: write` exclusivamente para el step que comenta.

## 4. Diseño de variables

Las cuatro variables viven en `infra/variables.tf`. Cada una tiene `description`, `type`, y `validation` cuando aporta valor.

| Nombre | Tipo | Valor en dev | Diferencia esperada en prod |
|--------|------|--------------|------------------------------|
| `environment` | `string` | `"dev"` | `"prod"` (validado contra allow-list `["dev","prod"]`) |
| `project_name` | `string` | `"pdds-oyd"` | Igual — se usa como tag y como componente del nombre |
| `region` | `string` | `"us-east-1"` | Igual en Delivery 1; podría diverger si prod adopta multi-región en Delivery 4+ |
| `bucket_name_prefix` | `string` | `"pdds-oyd-bootstrap"` | Mismo prefijo; el diferenciador es `var.environment` interpolado en el nombre del bucket |

`dev.tfvars` vive en `infra/envs/dev/dev.tfvars` y es el archivo que consume el pipeline de CI (`-var-file=envs/dev/dev.tfvars`). `infra/envs/prod/` queda intencionalmente vacío en Delivery 1 — se llena cuando aparezcan el remote state y los overrides específicos de prod en Delivery 2.

Las variables fluyen al grafo de recursos así: `region` → bloque del provider → llamadas a la API de AWS; `project_name` y `environment` → `default_tags` del provider → todos los recursos; `bucket_name_prefix` + `environment` + `random_id.bucket_suffix.hex` → nombre del bucket.

## 5. Decisiones y trade-offs

**(a) S3 como recurso PoC.**
Elegimos un bucket S3 como recurso de prueba porque va a ser reutilizado en deliveries posteriores sin re-trabajo: cubre directamente el requisito de Storage de Delivery 2 (versioning y encryption ya configurados) y va a hostear el backend remoto del Terraform state cuando se migre desde local. La inversión inicial en cablear el bucket se amortiza en las dos entregas siguientes.

**(b) `terraform_wrapper: false` y `tee plan.txt` en vez de usar el wrapper de `setup-terraform`.**
El wrapper default de `setup-terraform` inyecta códigos ANSI y mezcla stdout/stderr de forma que el output capturado queda ruidoso cuando se postea como comentario en el PR. Desactivar el wrapper y redirigir explícitamente con `2>&1 | tee plan.txt` nos da un artefacto determinístico y reviewable. El step del script trunca el comentario a 60K caracteres para quedar holgadamente debajo del límite de 65K de comentarios de GitHub. Trade-off: perdemos el resumen del plan que el wrapper imprime automáticamente en los logs del Action, pero el `tee` ya cubre eso.

**(c) `.terraform.lock.hcl` versionado; todos los `*.tfvars` ignorados salvo `dev.tfvars`.**
Pinear las versiones de los providers es un requisito de determinismo — sin el lock file, `terraform init` resuelve la versión más fresca que matchee el constraint y CI puede diverger del entorno local. El patrón de los `*.tfvars` es el trade-off inverso: los tfvars muchas veces transportan secretos, así que el default seguro es ignorarlos, con `dev.tfvars` whitelisted explícitamente porque tanto el grader como el CI lo necesitan. Los tfvars de producción (cuando existan) se whitelistean por nombre también; los tfvars locales ad-hoc quedan fuera del repo.
