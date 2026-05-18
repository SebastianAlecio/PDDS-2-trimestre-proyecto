# Resumen Delivery 2 — Compute, Storage, Database & Remote State

El workspace de D1 (un bucket S3 PoC en `infra/main.tf` y un pipeline de CI verde) se extiende en D2 con tres módulos reutilizables (`compute`, `storage`, `database`), un workspace de bootstrap (`infra/bootstrap/`) que provisiona el bucket S3 + tabla DynamoDB que hostean el state remoto, y la migración del state local del workspace raíz a ese backend con locking.

El dominio que justifica las decisiones técnicas es **Ticke-T**, el sistema diseñado en el curso paralelo de Infraestructura en la Nube y documentado en la carpeta `cloud/` de este repositorio (rama `cloud-delivery-1`): plataforma de gestión de tickets que las empresas medianas y grandes contratan para canalizar las solicitudes internas entre sus colaboradores y las áreas corporativas (TI, RRHH, administración). Los colaboradores crean tickets desde un portal interno mediante formulario o chat en vivo; los agentes los atienden desde un panel multi-agente con SLAs por prioridad. El sistema pasa la mayor parte del tiempo con poca carga y recibe picos puntuales — por ejemplo, los lunes a la mañana cuando se acumulan los pedidos del fin de semana, o cuando se cae un sistema interno y muchos colaboradores reportan a la vez. El patrón de acceso dominante es single-entity (`get ticket by id`, `append message to ticket`), lo que encaja con un modelo clave-valor; las dimensiones secundarias (status, agente asignado) se manejan con índices secundarios.

## 1. Compute target y justificación

**Servicio seleccionado:** AWS Lambda estructurado bajo microservicios orientados a eventos, asociado a un execution role de IAM con el principio de menor privilegio.

Lambda gana sobre las otras dos opciones permitidas (EC2, ECS Fargate task) por tres características del sistema:

1. **Poca carga la mayor parte del tiempo, con picos puntuales.** Una empresa que usa Ticke-T internamente recibe decenas de tickets al día, no miles. La mayor parte del horario laboral las cosas están tranquilas; los picos llegan en momentos específicos: el lunes a la mañana cuando se abren tickets acumulados del fin de semana, un despliegue que rompe un sistema interno y dispara reportes en cadena, o el primer día de cada mes cuando RRHH habilita un trámite nuevo. Lambda paga solo por request: en los espacios libres no cuesta nada y en los picos absorbe la demanda sin pre-aprovisionar.
2. **Operacionalmente managed.** AWS gestiona el runtime, el parcheo del sistema operativo, el balanceo de carga y la alta disponibilidad.
3. **Escalado instantáneo de conexiones.** El widget de chat mantiene una conexión persistente (WebSocket sobre API Gateway). API Gateway invoca un Lambda por cada mensaje que entra y los Lambdas escalan a miles de invocations concurrentes sin pre-aprovisionar, lo que es crítico cuando la caída de un sistema interno dispara cientos de reportes en pocos minutos.
4. **Combinación con DynamoDB.** El stack de datos elegido es DynamoDB. Lambda + DynamoDB es la combinación canónica en AWS: el SDK de DynamoDB es stateless, no requiere connection pool, no necesita VPC y escala en paralelo con la concurrencia de Lambda. Una arquitectura equivalente sobre RDS hubiera exigido RDS Proxy o un pool manejado para evitar el connection storm clásico de Lambda → RDBMS, complejidad que en esta combinación desaparece.

EC2 con launch template fue descartado porque obliga a pagar por VMs ociosas durante mucho tiempo y agrega carga operacional (AMIs, autoscaling, patching) que no aporta valor al dominio. ECS Fargate es el punto intermedio, pero seguiría pagando por tasks vivas; el scale-to-zero con CloudWatch alarms es complicado y agrega latencia.

**Trade-off reconocido.** El modelo *pay-per-invocation* de Lambda es ventajoso a volumen bajo y medio (que es donde apuntamos para Ticke-T), pero se vuelve más caro que una instancia EC2 o un task de Fargate always-on cuando el volumen sostenido supera cierto umbral (en órdenes de millones de invocaciones al mes). Para los tipos de empresa que se puede implementar Ticke-T — startups y mid-market con docenas a cientos de chats al día — estamos muy lejos de ese umbral, así que el trade-off no impacta hoy. Si en el futuro la facturación de Lambda supera un techo predefinido, se evaluaría migrar el handler crítico a Fargate sin tocar el modelo de datos ni el resto del sistema.

## 2. Diseño de los módulos

Los tres módulos viven en `infra/modules/<name>/` y cada uno tiene su propio `main.tf`, `variables.tf` y `outputs.tf`. Todos los inputs tienen `description` y `type`; los inputs con dominio cerrado tienen `validation`. Los outputs incluyen el ARN del recurso principal y los identificadores adicionales que el root o módulos hermanos necesitan referenciar.

### `modules/compute`
- **Inputs principales:** `environment`, `name`, `memory_size` (con validación 128–10240), `runtime`, `handler`, `source_dir`, `timeout_seconds`, `log_retention_days`.
- **Outputs:** `function_arn`, `function_name`, `log_group_name`, `execution_role_arn`.
- **Recursos:** `aws_iam_role` con assume role de Lambda → `aws_iam_role_policy` cuyas acciones (`logs:CreateLogStream`, `logs:PutLogEvents`) están scoped al ARN exacto del log group precreado (no usa wildcards) → `aws_cloudwatch_log_group` con retención configurable → `aws_lambda_function` que toma el zip generado por `data "archive_file"` desde `src/`.
- **Por qué el log group se precrea:** así la policy IAM puede referenciar el ARN específico (`${log_group.arn}:*`). Si dejáramos que Lambda creara el log group on-first-invoke, la policy tendría que incluir `logs:CreateLogGroup` con resource `arn:aws:logs:*:*:*`.

### `modules/storage`
- **Inputs principales:** `environment`, `bucket_name_prefix` (con regex validation), `lifecycle_prefix` (default `attachments/`), `lifecycle_ia_transition_days` (default 30), `lifecycle_noncurrent_expiration_days` (default 90).
- **Outputs:** `bucket_arn`, `bucket_name`, `bucket_regional_domain_name`.
- **Recursos:** `aws_s3_bucket` con nombre `${prefix}-${env}-${random_hex}` → `aws_s3_bucket_versioning` (Enabled) → `aws_s3_bucket_server_side_encryption_configuration` (AES256) → `aws_s3_bucket_public_access_block` con los cuatro switches → `aws_s3_bucket_lifecycle_configuration` con regla scoped al prefix `attachments/` (transition a STANDARD_IA a 30 días, expiración de versiones no-current a 90) → `aws_s3_bucket_policy` con Deny sobre `aws:SecureTransport=false` para forzar SSL.
- **Por qué el lifecycle es scoped y no bucket-wide:** el bucket está pensado para alojar los **adjuntos de los tickets de Ticke-T** (US-04 del pitch de cloud — capturas que el colaborador sube al formulario o al chat, screenshots que el agente le manda de vuelta). En entregas siguientes el mismo bucket también podría alojar otros objetos (transcripciones de chat exportables, reportes de métricas del gerente).

### `modules/database`
- **Inputs principales:** `environment`, `name`, `billing_mode` (validación in `{"PAY_PER_REQUEST","PROVISIONED"}`, default `PAY_PER_REQUEST`), `ttl_attribute_name` (default `"ttl"`), `point_in_time_recovery_enabled` (bool, default `true`), `deletion_protection_enabled` (bool, default `false`).
- **Outputs:** `table_name`, `table_arn`.
- **Recursos:** un único `aws_dynamodb_table` con `hash_key = "ticket_id"`, `range_key = "sk"`, bloques `attribute` para los cuatro campos que participan en keys/índices (`ticket_id`, `sk`, `status`, `updated_at`), un bloque `global_secondary_index` (`status-updated-at-index`, projection `ALL`) para listar tickets por estado, un bloque `ttl` con `attribute_name = "ttl"` y `enabled = true`, `server_side_encryption.enabled = true`, y `point_in_time_recovery.enabled = true` para restore al segundo dentro de los últimos 35 días.
- **Por qué single-table design:** el access pattern dominante es "traeme el ticket X y todos sus mensajes en orden". Con PK = `ticket_id` y SK = `sk`, una sola `Query(ticket_id)` devuelve el item de metadata (`sk = "META"`) más todos los mensajes (`sk = "MSG#<iso-timestamp>"`) ordenados cronológicamente, en una llamada. Un diseño multi-tabla (tickets + messages separados) duplicaría infra de Terraform y forzaría dos `Query()` distintos que la aplicación tendría que unir manualmente.

### Decisión de interface destacada: diseño del GSI por `status`

DynamoDB requiere que cualquier campo usado como `hash_key` o `range_key` de un GSI esté declarado como `attribute` en el resource. Eso parece trivial, pero define qué dimensiones del modelo se pueden consultar barato. Elegimos GSI con `hash_key = status` y `range_key = updated_at` porque la query principal del panel del agente es *"muestrame los tickets `open` ordenados por última actividad"*: con este GSI cuesta una sola `Query("open")` y devuelve los items ya ordenados. El módulo expone solo el ARN de la tabla; las consultas al GSI se hacen sobre `${table_arn}/index/status-updated-at-index`.

### Wiring desde el root

`infra/main.tf` declara los tres `module ""` blocks tomando los inputs de variables. Los outputs de cada módulo se referencian en `infra/outputs.tf` (root outputs): `compute_function_arn`, `attachments_bucket_arn`, `tickets_table_arn`.

Como DynamoDB es un servicio regional accedido por API IAM-signed (no por red), el módulo `database` no necesita `vpc_id` ni `subnet_ids`; tampoco hay security group ni ingress rule.

## 3. Migración del state remoto

El workspace de bootstrap en `infra/bootstrap/` provisiona los dos recursos que hostean el state remoto del workspace raíz: un bucket S3 con versioning, SSE-S3 y los cuatro switches de bloqueo público, y una tabla DynamoDB con `billing_mode=PAY_PER_REQUEST` y `hash_key="LockID"`. Ambos llevan `lifecycle { prevent_destroy = true }` para que un `terraform destroy` accidental en el workspace falle en plan-time en lugar de borrar la infraestructura que sostiene al propio state.

El workspace de bootstrap *no* tiene backend block: gestiona el bucket donde vivirá el state remoto del workspace principal, por lo que tiene que usar state local. El archivo `infra/bootstrap/terraform.tfstate` se commitea explícitamente al repositorio.

### Pasos ejecutados

1. `terraform init && terraform apply` en `infra/bootstrap/` creando el bucket y la tabla.
2. `terraform output` para leer los tres valores que el backend block del workspace principal necesita.
3. Creación de `infra/backend.tf` con esos tres valores **hardcoded** — Terraform no permite variables ni locals dentro de un bloque `backend`.
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

### Identificadores del state backend

| Componente | Valor |
|------------|-------|
| Bucket S3 | `pdds-oyd-tfstate-d0d13937` |
| Tabla DynamoDB de lock | `pdds-oyd-tflock` |
| Región | `us-east-1` |
| Key del objeto en S3 | `infra/terraform.tfstate` |
| Encryption del backend | `encrypt = true` (SSE-S3, además del SSE del bucket) |

## 4. Acceso a la base de datos

DynamoDB no expone credenciales de tipo master user / password como RDS. El plano de autenticación y autorización es 100% IAM: cada principal (persona o servicio) que llama a la API de DynamoDB lo hace con un request firmado vía AWS SigV4, y AWS evalúa el `Action`/`Resource` contra las políticas adjuntas al principal. Esto elimina toda la categoría de problemas asociada a manejar passwords en archivos, env vars y logs.

### Aislamiento del acceso a la tabla

DynamoDB es un servicio regional accedido vía HTTPS firmado con SigV4 (`dynamodb.us-east-1.amazonaws.com`). No tiene endpoint público ni privado en el sentido de RDS, no vive en un VPC, y no hay security groups que configurar. El control de acceso es enteramente IAM:

- La Lambda execution role creada por `modules/compute` hoy solo tiene permisos de logs.
- Cualquier principal no autorizado que intente llamar a la API de DynamoDB contra esta tabla recibe `AccessDeniedException`, sin importar desde qué red venga el request.
- Confidencialidad en reposo: `server_side_encryption.enabled = true` encripta todos los ítems con una clave AWS-owned KMS (no requiere configuración adicional ni costo de CMK).
- Continuidad de servicio: `point_in_time_recovery.enabled = true` permite restaurar la tabla a cualquier segundo dentro de los últimos 35 días — protege ante un borrado accidental o un bug que corrompa data sin tener que mantener un schedule de backups manual.

## 5. Trade-offs arquitectónicos

### Trade-off A — DynamoDB (NoSQL) sobre RDS Postgres (relacional)

El stack de compute de Ticke-T es 100% Lambda, y los access patterns que dominan el workload son single-entity: `get ticket by id`, `append message to ticket`, `list open tickets ordered by last activity`. El modelo on-demand escala en paralelo con la concurrencia de Lambda sin connection pool, y el costo escala a cero cuando el tráfico cae. Una arquitectura equivalente sobre RDS Postgres hubiera requerido pre-aprovisionar una instancia que paga storage 24/7 incluso cuando el sistema está ocioso, y resolver el problema de conexión de Lambda → RDBMS — típicamente vía RDS Proxy, lo que agrega un componente más al stack y aún así no escala a cero.

El costo reconocido de elegir DynamoDB es que las queries multi-entity con joins (*"cuentame los tickets por categoría agrupados por agente con su tiempo medio de resolución"*) ya no son una sola línea de SQL: se resuelven con denormalización (escribir el ticket con campos duplicados pensados para el query), GSIs adicionales por dimensión que se quiera filtrar, o un pipeline analítico aparte (DynamoDB → S3 → Athena) cuando aparezca un dashboard de métricas.

### Trade-off B — Single-table design vs multi-table design

DynamoDB permite dos estilos para modelar entidades con relaciones: poner cada entidad en su propia tabla (`tickets`, `messages`, `agents`...) o mantener todas las entidades en una sola tabla diferenciadas por el sort key (`PK=ticket_id`, `SK="META"` para metadata del ticket, `SK="MSG#<iso-ts>"` para cada mensaje, `SK="AGENT#<id>"` para el binding del agente asignado, etc.). Elegimos single-table porque (a) el access pattern dominante es "traeme el ticket + su historial completo de mensajes", y eso se resuelve con una sola `Query(ticket_id)` que devuelve todo ordenado — vs. dos `Query` con llamadas separadas si los mensajes vivieran en otra tabla; (b) el GSI por `status` cubre el segundo access pattern del agente sin agregar más tablas.
