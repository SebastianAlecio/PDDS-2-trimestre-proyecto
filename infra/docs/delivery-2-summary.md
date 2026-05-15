# Resumen Delivery 2 — Compute, Storage, Database & Remote State

**Curso:** Optimizations and Performance (PDDS, Galileo)
**Selección de track:** Estándar (sin EKS) · CI = GitHub Actions (sin proveedor externo)
**Tag de entrega:** `oyd-delivery-2`

El workspace de D1 (un bucket S3 PoC en `infra/main.tf` y un pipeline de CI verde) se extiende en D2 con tres módulos reutilizables (`compute`, `storage`, `database`), un workspace de bootstrap (`infra/bootstrap/`) que provisiona el bucket S3 + tabla DynamoDB que hostean el state remoto, y la migración del state local del workspace raíz a ese backend con locking.

El dominio que justifica las decisiones técnicas es **Ticke-T**, el sistema diseñado en el curso paralelo de Infraestructura en la Nube y documentado en la carpeta `cloud/` de este repositorio (rama `cloud-delivery-1`): plataforma SaaS de gestión de tickets que las empresas medianas y grandes contratan para canalizar las solicitudes internas entre sus colaboradores y las áreas corporativas (TI, RRHH, administración). Los colaboradores crean tickets desde un portal interno mediante formulario o chat en vivo; los agentes los atienden desde un panel multi-agente con SLAs por prioridad. El sistema pasa la mayor parte del tiempo con poca carga y recibe picos puntuales — por ejemplo, los lunes a la mañana cuando se acumulan los pedidos del fin de semana, o cuando se cae un sistema interno y muchos colaboradores reportan a la vez. Modelo de datos relacional (tickets ↔ mensajes ↔ agentes ↔ colaboradores, con timeline de eventos por ticket).

## 1. Compute target y justificación

**Servicio seleccionado:** AWS Lambda con execution role IAM. Runtime `nodejs22.x`, handler `index.handler`, memoria 128 MB. La función final se llama `chat-message-handler-dev` y en D3+ vivirá detrás de API Gateway (WebSocket + REST) recibiendo los mensajes del widget de chat y persistiéndolos como tickets/mensajes.

Lambda gana sobre las otras dos opciones permitidas (EC2 con launch template, ECS Fargate task) por tres características del sistema:

1. **Poca carga la mayor parte del tiempo, con picos puntuales.** Una empresa que usa Ticke-T internamente recibe decenas de tickets al día, no miles. La mayor parte del horario laboral las cosas están tranquilas; los picos llegan en momentos específicos: el lunes a la mañana cuando media empresa abre tickets acumulados del fin de semana, un despliegue que rompe un sistema interno y dispara reportes en cadena, o el primer día de cada mes cuando RRHH habilita un trámite nuevo. Lambda paga solo por request: en los huecos no cuesta nada y en los picos absorbe la demanda sin pre-aprovisionar.
2. **Operacionalmente managed.** AWS gestiona el runtime, el parcheo del sistema operativo, el balanceo de carga y la alta disponibilidad. No hay AMIs que mantener al día, ni autoscaling groups que dimensionar, ni servidores con SSH que asegurar. Para un equipo de tres personas en el MVP de Ticke-T, ese ahorro de carga operacional libera tiempo para trabajar en el producto en lugar de en infraestructura.
3. **Escalado instantáneo de conexiones.** El widget de chat mantiene una conexión persistente (WebSocket sobre API Gateway). API Gateway invoca un Lambda por cada mensaje que entra y los Lambdas escalan a miles de invocations concurrentes sin pre-aprovisionar, lo que es crítico cuando la caída de un sistema interno dispara cientos de reportes en pocos minutos.

EC2 con launch template fue descartado porque obliga a pagar por VMs ociosas el 95% del tiempo y agrega carga operacional (AMIs, autoscaling, patching) que no aporta valor al dominio. ECS Fargate es el punto intermedio, pero seguiría pagando por tasks vivas; el scale-to-zero con CloudWatch alarms es complicado y agrega latencia inaceptable para el objetivo del pitch de cloud (el primer mensaje del colaborador visible en el panel del agente en ≤ 3 segundos).

**Trade-off reconocido.** El modelo *pay-per-invocation* de Lambda es ventajoso a volumen bajo y medio (que es donde apuntamos para Ticke-T MVP), pero se vuelve más caro que una instancia EC2 o un task de Fargate always-on cuando el volumen sostenido supera cierto umbral (en órdenes de millones de invocations al mes). Para los tipos de empresa que sirve Ticke-T — startups y mid-market con docenas a cientos de chats al día — estamos muy lejos de ese umbral, así que el trade-off no impacta hoy. Si en el futuro la facturación de Lambda supera un techo predefinido, evaluaríamos migrar el handler crítico a Fargate sin tocar el modelo de datos ni el resto del sistema.

## 2. Diseño de los módulos

Los tres módulos viven en `infra/modules/<name>/` y cada uno tiene su propio `main.tf`, `variables.tf` y `outputs.tf`. Todos los inputs tienen `description` y `type`; los inputs con dominio cerrado tienen `validation`. Los outputs incluyen el ARN del recurso principal (requisito del rubric) y los identificadores adicionales que el root o módulos hermanos necesitan referenciar.

### `modules/compute`
- **Inputs principales:** `environment`, `name`, `memory_size` (con validación 128–10240), `runtime`, `handler`, `source_dir`, `timeout_seconds`, `log_retention_days`.
- **Outputs:** `function_arn`, `function_name`, `log_group_name`, `execution_role_arn`.
- **Recursos:** `aws_iam_role` con assume role de Lambda → `aws_iam_role_policy` cuyas acciones (`logs:CreateLogStream`, `logs:PutLogEvents`) están scoped al ARN exacto del log group precreado (no usa wildcards) → `aws_cloudwatch_log_group` con retención configurable → `aws_lambda_function` que toma el zip generado por `data "archive_file"` desde `src/`.
- **Por qué el log group se precrea:** así la policy IAM puede referenciar el ARN específico (`${log_group.arn}:*`) y cumplir el requisito del rubric de *no wildcards en Resource*. Si dejáramos que Lambda creara el log group on-first-invoke, la policy tendría que incluir `logs:CreateLogGroup` con resource `arn:aws:logs:*:*:*` — un wildcard que el rubric prohíbe.

### `modules/storage`
- **Inputs principales:** `environment`, `bucket_name_prefix` (con regex validation), `lifecycle_prefix` (default `attachments/`), `lifecycle_ia_transition_days` (default 30), `lifecycle_noncurrent_expiration_days` (default 90).
- **Outputs:** `bucket_arn`, `bucket_name`, `bucket_regional_domain_name`.
- **Recursos:** `aws_s3_bucket` con nombre `${prefix}-${env}-${random_hex}` → `aws_s3_bucket_versioning` (Enabled) → `aws_s3_bucket_server_side_encryption_configuration` (AES256) → `aws_s3_bucket_public_access_block` con los cuatro switches → `aws_s3_bucket_lifecycle_configuration` con regla scoped al prefix `attachments/` (transition a STANDARD_IA a 30 días, expiración de versiones no-current a 90) → `aws_s3_bucket_policy` con Deny sobre `aws:SecureTransport=false` para forzar SSL.
- **Por qué el lifecycle es scoped y no bucket-wide:** el bucket está pensado para alojar los **adjuntos de los tickets de Ticke-T** (US-04 del pitch de cloud — capturas que el colaborador sube al formulario o al chat, screenshots que el agente le manda de vuelta). En entregas siguientes el mismo bucket también podría alojar otros objetos (transcripciones de chat exportables, reportes de métricas del gerente). La regla scoped al prefijo `attachments/` deja a esos otros objetos en Standard sin que la política los degrade automáticamente a IA. El rubric explícitamente prohíbe lifecycle rules sin scope.

### `modules/database`
- **Inputs principales:** `environment`, `name`, `instance_class`, `engine_version`, `multi_az` (variable que debe existir según rubric, default false en dev), `allocated_storage`, `vpc_id`, `subnet_ids` (validación `length >= 2`), `allowed_security_groups` (mapa label → SG ID), `db_username`, `db_password` (`sensitive = true`, sin default, con validación de longitud ≥8), `db_name` (default `tickets`), `backup_retention_period`.
- **Outputs:** `db_endpoint`, `db_arn`, `db_security_group_id`, `db_subnet_group_name`.
- **Recursos:** `aws_db_subnet_group` referenciando al menos dos subnets en AZs distintas → `aws_db_parameter_group` familia `postgres17` con `log_min_duration_statement=1000` (loguea queries >1 s para triage de performance — clave para detectar joins lentos en la cola del agente o en el dashboard de métricas del gerente) → `aws_security_group` para la DB con egress all y sin reglas de ingress inline → `aws_security_group_rule` por cada entrada del mapa `allowed_security_groups`, abriendo el puerto 5432 desde el SG fuente (sin `0.0.0.0/0` en ningún lado) → `aws_db_instance` Postgres 17 con `storage_encrypted=true`, `publicly_accessible=false`, schema inicial `tickets`, contraseña desde `var.db_password` sensitive.

### Decisión de interface destacada: `allowed_security_groups` como `map(string)` en vez de `list(string)`

Originalmente la variable se modeló como `list(string)`, lo que producía el error de plan-time:

```
The "for_each" set includes values derived from resource attributes that cannot be
determined until apply, and so Terraform cannot determine the full set of keys that
will identify the instances of this resource.
```

El issue es que las claves del set para `for_each` se derivaban de los SG IDs (`aws_security_group.app_tier.id`), que son *unknown after apply*. La solución idiomática en Terraform es usar un mapa donde las claves sean valores estáticos del config y los valores sean los unknowns. Así el módulo soporta múltiples tiers de aplicación (`{ app_tier = ..., admin_tier = ... }`) sin reescribir su interface, y el plan resuelve cleanly.

### Wiring desde el root

`infra/main.tf` declara los tres `module ""` blocks tomando los inputs de variables o locals — ningún valor está hardcoded en las llamadas. Los outputs de cada módulo se referencian en `infra/outputs.tf` (root outputs) y, en el caso del SG de la app tier, también como input del módulo de database. Esto satisface el criterio del rubric "≥1 module output referenced by another resource or root output" con margen.

Los data sources `aws_vpc.default` y `aws_subnets.default` se usan para alimentar el subnet group del RDS sin requerir provisionamiento de VPC propia (la VPC custom es responsabilidad del Delivery 4 del curso de Infraestructura en la Nube).

## 3. Migración del state remoto

El workspace de bootstrap en `infra/bootstrap/` provisiona los dos recursos que hostean el state remoto del workspace raíz: un bucket S3 con versioning, SSE-S3 y los cuatro switches de bloqueo público, y una tabla DynamoDB con `billing_mode=PAY_PER_REQUEST` y `hash_key="LockID"`. Ambos llevan `lifecycle { prevent_destroy = true }` para que un `terraform destroy` accidental en el workspace falle en plan-time en lugar de borrar la infraestructura que sostiene al propio state.

El workspace de bootstrap *no* tiene backend block: gestiona el bucket donde vivirá el state remoto del workspace principal, por lo que tiene que usar state local. El archivo `infra/bootstrap/terraform.tfstate` se commitea explícitamente al repositorio (whitelisted en `.gitignore` con `!infra/bootstrap/terraform.tfstate`).

### Pasos ejecutados

1. `terraform init && terraform apply` en `infra/bootstrap/` creando el bucket y la tabla.
2. `terraform output` para leer los tres valores que el backend block del workspace principal necesita.
3. Creación de `infra/backend.tf` con esos tres valores **hardcoded** — Terraform no permite variables ni locals dentro de un bloque `backend`, esto es una restricción del lenguaje, no una elección de estilo.
4. `terraform init -migrate-state` desde `infra/` para mover el state del backend local al S3.
5. Eliminación de `infra/terraform.tfstate` y `infra/terraform.tfstate.backup` del working tree; las dos rutas siguen ignoradas globalmente por `.gitignore`.

### Excerpt del `terraform init` que confirma la migración

```
Initializing the backend...

Successfully configured the backend "s3"! Terraform will automatically
use this backend unless the backend configuration changes.
Initializing modules...
Initializing provider plugins...
- Reusing previous version of hashicorp/aws from the dependency lock file
- Reusing previous version of hashicorp/random from the dependency lock file
- Reusing previous version of hashicorp/archive from the dependency lock file
- Using previously-installed hashicorp/random v3.8.1
- Using previously-installed hashicorp/archive v2.8.0
- Using previously-installed hashicorp/aws v5.100.0

Terraform has been successfully initialized!
```

El prompt de copy-state no apareció porque el state local del workspace principal estaba vacío (`resources: []`); el D1 se mantuvo en state local con cero recursos aplicados al cloud, así que el backend S3 quedó configurado directamente sin necesidad de copia explícita.

### Identificadores del state backend

| Componente | Valor |
|------------|-------|
| Bucket S3 | `pdds-oyd-tfstate-d0d13937` |
| Tabla DynamoDB de lock | `pdds-oyd-tflock` |
| Región | `us-east-1` |
| Key del objeto en S3 | `infra/terraform.tfstate` |
| Encryption del backend | `encrypt = true` (SSE-S3, además del SSE del bucket) |

## 4. Manejo de credenciales de la base de datos

La contraseña del usuario maestro del RDS (`tickets_admin`) se materializa en tres puntos del flujo y en ninguno de ellos vive en un archivo committeado:

- **En el código Terraform**, la variable `db_password` está declarada en `infra/variables.tf` y en `infra/modules/database/variables.tf` con `sensitive = true`, `type = string`, sin `default`, y con `validation { condition = length(var.db_password) >= 8 }`. La ausencia de default fuerza a que el plan/apply explote si la variable no se provee, en lugar de caer silenciosamente a un valor inseguro.
- **En el plano de configuración**, el archivo `infra/envs/dev/dev.tfvars` *no* contiene la contraseña — solamente las variables no-sensibles (`db_username`, `db_instance_class`, `db_multi_az`, etc.). El `.gitignore` ignora todos los `*.tfvars` por default, con whitelist explícita únicamente para `infra/envs/dev/dev.tfvars`. Cualquier archivo auxiliar como `infra/db_password.auto.tfvars` queda fuera del repo por la regla global `*.tfvars`.
- **En el plano de ejecución**, Terraform recibe el valor por `TF_VAR_db_password` como variable de ambiente del proceso. Localmente se exporta en la shell del operador; en CI se inyecta como GitHub Actions secret (`TF_VAR_DB_PASSWORD`) que el step de plan expone vía `env:`. Ni el YAML del workflow ni los logs del runner imprimen el valor en claro.

### Aislamiento de red de la instancia

El módulo `database` crea un `aws_security_group` dedicado para el RDS, con regla de egress all-traffic (RDS no inicia conexiones outbound más que para mantenimiento managed por AWS) y *sin reglas de ingress inline*. Las reglas de ingress se materializan a través de `aws_security_group_rule` por cada entrada del mapa `allowed_security_groups`, abriendo el puerto 5432 con `source_security_group_id` apuntando al SG fuente — nunca a `0.0.0.0/0`. En D2 el único entry es `app_tier = aws_security_group.app_tier.id`, donde `app_tier` es un security group placeholder en el workspace raíz que representa la *application tier* y al que se unirán los Lambda functions de Ticke-T cuando se cableen al VPC en D3+.

Como parte adicional de defensa en profundidad, `publicly_accessible = false` en `aws_db_instance` garantiza que la instancia no reciba una IP pública y solo sea alcanzable desde dentro del VPC, incluso si una regla de SG llegara a ser laxa accidentalmente.

## 5. Trade-offs arquitectónicos

### Trade-off A — RDS Postgres (relacional) vs DynamoDB (NoSQL)

Para Ticke-T el modelo de datos es relacional por naturaleza: un ticket tiene N mensajes, está asignado a un agente, pertenece a un colaborador, y cuenta con un timeline de eventos. Las queries del panel del agente y del dashboard del gerente se basan en joins (*"dame todos los tickets activos con su último mensaje y nombre del colaborador"*, *"agrupá por categoría y promediá el tiempo de resolución"*), que en SQL son una sola línea y en una base de datos documental requieren denormalización agresiva, índices secundarios costosos, o un pipeline aparte de pre-agregación.

DynamoDB sería la elección correcta si Ticke-T tuviera un modelo mucho más volumétrico y desnormalizado (multi-tenant con millones de mensajes por hora, queries que siempre van por partition key conocida). Ése no es nuestro dominio. A la escala que apuntamos — decenas a cientos de chats al día por empresa, single-tenant — Postgres maneja todo el grafo sin sufrir, mantiene la integridad referencial con foreign keys, y simplifica el código de la aplicación (un `JOIN` en SQL en lugar de tres `Query` calls al SDK que después hay que unir a mano).

El costo de elegir RDS sobre DynamoDB es que no escala a cero como DynamoDB on-demand: incluso apagando la instancia en horario no hábil, el storage sigue facturándose. Para el MVP académico ese costo es marginal (~$12/mes en `db.t4g.micro`), y se mitiga apagando la instancia entre sesiones de trabajo cuando no hace falta. Si en el futuro alguna tabla específica (ej. el timeline de eventos) crece a un patrón que ya no encaja en Postgres, el mismo sistema puede mover esa tabla a DynamoDB sin tocar las demás — Postgres y DynamoDB no son mutuamente excluyentes.

### Trade-off B — Default VPC con data sources vs VPC custom

El subnet group del RDS necesita al menos dos subnets en AZs distintas. Las dos opciones eran provisionar una VPC custom en este workspace o tomar la default VPC de la cuenta vía `data "aws_vpc" "default"` + `data "aws_subnets" "default"`. La decisión fue usar la default VPC porque (a) la consigna del Delivery 2 no pide VPC propia y la VPC custom es responsabilidad explícita del Delivery 4 del curso de Infraestructura en la Nube; (b) duplicar ese trabajo en el workspace de Optimizations introduce un fork en la arquitectura del proyecto que después habría que reconciliar; (c) la default VPC trae default security groups con egress amplio, pero el riesgo de exposure se mitiga creando un SG dedicado `app_tier` que actúa como source-of-truth para el ingress del RDS, en lugar de depender del default SG. El costo de esta decisión es que la default VPC no se puede destruir por Terraform desde este workspace, y queda fuera del scope de auditoría del módulo; ese trade-off se asume y se documenta para que el equipo lo revisite cuando promueva la red a VPC custom en D4.
