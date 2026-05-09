# Workspace Terraform

Workspace raíz de Terraform del proyecto. Contiene la configuración de provider, las variables, los outputs, los recursos y la documentación técnica que sostienen el pipeline de CI/CD definido en `.github/workflows/`.

## Equipo — Grupo 3

| Nombre | Carnet |
|--------|--------|
| Joaquín Marroquin | 20004254 |
| Alessandro Alecio | 21001224 |
| David García | 2600160 |

## Selección de track

Conforme al §2.4 del spec del curso *Optimizations and Performance*:

- **Compute / Kubernetes:** track estándar (serverless / managed compute). El track opcional EKS no se usa.
- **CI tooling:** GitHub Actions, default del curso. No se usa un proveedor de CI externo.

Esta selección es estable para los cinco deliveries del proyecto.

## Layout del workspace

```
infra/
├── provider.tf            # Provider AWS y pinning de versiones (Terraform y providers)
├── variables.tf           # Variables de entrada con description, type y validation
├── outputs.tf             # Outputs consumidos por módulos y pipeline downstream
├── main.tf                # Recursos del workspace raíz
├── envs/
│   ├── dev/dev.tfvars     # Valores del ambiente dev (versionado, sin secretos)
│   └── prod/              # Reservado para overrides de prod en deliveries posteriores
├── modules/               # Reservado para módulos reutilizables
└── docs/                  # Resúmenes de cada delivery (delivery-N-summary.md)
```

La separación en archivos (`provider.tf`, `variables.tf`, `outputs.tf`, `main.tf`) responde al criterio de Code Quality del spec: cualquier consolidación en un único `main.tf` reduce la nota.

## Recursos provisionados

En el estado actual (Delivery 1) el workspace raíz crea un único bucket S3 de bootstrap con hardening:

- `aws_s3_bucket.bootstrap` — bucket nombrado `${prefix}-${env}-${random_hex}`
- `aws_s3_bucket_versioning.bootstrap` — versioning habilitado
- `aws_s3_bucket_server_side_encryption_configuration.bootstrap` — SSE-S3 (AES256)
- `aws_s3_bucket_public_access_block.bootstrap` — los cuatro switches de bloqueo público activados
- `random_id.bucket_suffix` — sufijo aleatorio para garantizar unicidad global del nombre del bucket

Esta es una pieza temporal de proof-of-concept que valida el cableado provider/credenciales/variables. En Delivery 2 se reemplaza por módulos reales (compute, storage, db) y este bucket pasa a hostear el state remoto.

## Variables

Las cuatro variables de entrada viven en `variables.tf`:

| Nombre | Tipo | Default | Propósito |
|--------|------|---------|-----------|
| `environment` | `string` | (sin default; validado contra `["dev","prod"]`) | Discriminador de ambiente, usado en nombres y tags |
| `project_name` | `string` | `"pdds-oyd"` | Identificador corto del proyecto, presente como tag y prefijo |
| `region` | `string` | `"us-east-1"` | Región AWS donde se provisionan los recursos |
| `bucket_name_prefix` | `string` | `"pdds-oyd-bootstrap"` | Prefijo del bucket de bootstrap |

Los valores concretos por ambiente viven en `envs/<env>/<env>.tfvars`. El pipeline de CI consume `envs/dev/dev.tfvars`. La carpeta `envs/prod/` se mantiene vacía hasta que prod tenga sus propios overrides en deliveries posteriores.

## Outputs

`outputs.tf` expone dos valores que módulos y pipelines downstream consumirán en deliveries posteriores:

| Output | Tipo | Consumidores esperados |
|--------|------|------------------------|
| `bootstrap_bucket_name` | `string` | Pipelines y módulos que necesiten referenciar el bucket por nombre |
| `bootstrap_bucket_arn` | `string` | IAM policies y resources que requieran el ARN del bucket |

## Estrategia de credenciales

Las credenciales de AWS nunca aparecen en archivos versionados ni en el código HCL. El provider AWS las resuelve desde la cadena estándar del AWS SDK:

- **CI (mecanismo principal):** los tres valores se almacenan como GitHub Actions secrets cifrados (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`) y se inyectan únicamente en el step `aws-actions/configure-aws-credentials@v4`, que los expone como variables de ambiente del runner. Ningún otro step ve las credenciales en claro y no aparecen en el YAML. Esta es la vía por la que el pipeline ejecuta plan en cada PR.
- **Local (depuración y desarrollo):** se utiliza el shared credentials file (`~/.aws/credentials`) generado por `aws configure`. Alternativamente, exportar `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` como variables de ambiente también es válido — el provider las recoge automáticamente y tienen prioridad sobre el shared credentials file.

En Delivery 5 las llaves de larga vida se reemplazan por federación OIDC (asunción de rol IAM desde el runner de Actions vía web identity), eliminando los secrets de larga duración del lado de CI.

## Versionado y state

- Las versiones de Terraform y providers están pinadas (`required_version = "~> 1.8"`, `aws ~> 5.0`, `random ~> 3.6`). El archivo `.terraform.lock.hcl` está versionado para reproducibilidad determinística.
- Durante Deliveries 1–3 el state es local (`terraform.tfstate` en `infra/`, gitignored). La migración a un backend remoto S3 + DynamoDB es requisito en Delivery 2.
- Los archivos `*.tfvars` están gitignored por defecto (pueden contener secretos), con `dev.tfvars` whitelisted explícitamente porque CI y los graders dependen de él.

## Setup inicial (one-time)

Pasos para llevar el proyecto de cero hasta tener el pipeline de CI corriendo verde. Hay que recorrerlos una sola vez por equipo; después solo aplica la sección de *Ejecución manual local* y el flujo normal de PRs.

### Prerrequisitos

- [Terraform](https://developer.hashicorp.com/terraform/install) `~> 1.8` (matchea `required_version` en `provider.tf`).
- [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html).
- [`gh`](https://cli.github.com/) (opcional pero recomendado — los pasos de GitHub se pueden hacer también desde la web UI).
- Cuenta de AWS con permisos para crear los recursos del proyecto (S3, IAM, EC2, etc. en deliveries posteriores).
- Cuenta de GitHub con permisos para crear repos.

### 1. Clonar y configurar credenciales AWS locales

```bash
git clone <repo-url> && cd <repo>
aws configure   # ingresa access key, secret key y region (us-east-1)
aws sts get-caller-identity   # verificación rápida
```

Como alternativa al shared credentials file, exportar las tres variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`) en el ambiente del shell también funciona — el provider las detecta automáticamente.

### 2. Crear el repo y configurar visibilidad

El repo debe ser **público** o, alternativamente, mantenerse privado con los usuarios `jatitoam` y `abner-perez` agregados como collaborators con permiso Read (requisito del spec del curso).

```bash
# Opción A: crear repo público desde cero
gh repo create <org-or-user>/<repo-name> --public --source=. --remote=origin --push

# Opción B: repo privado + invitar a los graders
gh repo create <org-or-user>/<repo-name> --private --source=. --remote=origin --push
gh api -X PUT repos/<org-or-user>/<repo-name>/collaborators/jatitoam   -f permission=pull
gh api -X PUT repos/<org-or-user>/<repo-name>/collaborators/abner-perez -f permission=pull
```

### 3. Cargar los secrets de GitHub Actions

El workflow de CI consume tres secrets cifrados. Sin ellos, el step `Configure AWS credentials` falla y el plan no corre. Cargarlos una sola vez:

```bash
gh secret set AWS_ACCESS_KEY_ID     --body "$(aws configure get aws_access_key_id)"
gh secret set AWS_SECRET_ACCESS_KEY --body "$(aws configure get aws_secret_access_key)"
gh secret set AWS_REGION            --body "us-east-1"
gh secret list   # confirmar que aparecen los tres
```

Estos valores nunca se versionan ni se imprimen en logs — `aws-actions/configure-aws-credentials@v4` los maskea automáticamente.

### 4. Validar el pipeline con un PR

El workflow se dispara en `pull_request` contra `main`, no en pushes directos. Para confirmar que la cadena `fmt → init → validate → plan → comment` corre verde, abrir un PR mínimo:

```bash
git checkout -b ci/smoke-test
echo "" >> README.md   # cualquier cambio trivial
git commit -am "ci: smoke test del pipeline"
git push -u origin ci/smoke-test
gh pr create --fill --base main
```

Verificar en la pestaña *Checks* del PR que: (i) los cuatro steps bloqueantes pasan, (ii) aparece un comentario con el plan colapsable (`<details>`), (iii) el comentario incluye el plan completo de los recursos del workspace.

## Ejecución manual local

El pipeline de CI es la vía oficial de ejecución, pero el workspace soporta ejecución local para depuración y desarrollo. Desde `infra/`:

- `terraform fmt -check -recursive` — verifica el estilo HCL (mismo comando que ejecuta CI).
- `terraform init -backend=false` — descarga providers usando el lock file, sin inicializar backend remoto.
- `terraform validate` — análisis estático del grafo, sin llamadas a la API.
- `terraform plan -var-file=envs/dev/dev.tfvars` — plan completo contra AWS (requiere credenciales en el ambiente, ver sección anterior).
- `terraform apply -var-file=envs/dev/dev.tfvars` — aplica los cambios; `terraform destroy` con la misma `-var-file` los revierte.

## Pipeline de CI

`.github/workflows/terraform-ci.yml` se ejecuta en cada pull request contra `main`. Es una secuencia lineal: cualquier exit code distinto de cero en los pasos de validación bloquea el PR check.

| # | Step | Bloqueante |
|---|------|:----------:|
| 1 | `terraform fmt -check -recursive` | Sí |
| 2 | `terraform init -backend=false` | Sí |
| 3 | `terraform validate` | Sí |
| 4 | `terraform plan -var-file=envs/dev/dev.tfvars` | Sí |
| 5 | Comentario en el PR con el output del plan colapsable | No |

Permisos del workflow: `contents: read`, `pull-requests: write`. El último permiso es necesario únicamente para el step que postea el comentario.

## Resúmenes de delivery

- [Delivery 1 — IaC Workspace Bootstrap & CI Pipeline](docs/delivery-1-summary.md)
