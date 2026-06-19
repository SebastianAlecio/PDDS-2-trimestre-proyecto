# OYD-D4 — Async Infrastructure & Full CD Pipeline

> Resumen de lo entregado en Delivery 4 — Optimizations and Performance · ciclo Mayo–Junio 2026
> **Equipo:** Sebastián Alecio · David García · Joaquín Marroquín
> **Tag de entrega:** `oyd-delivery-4`

---

## 1. Async messaging design

**Servicio elegido:** Amazon SQS standard (NO FIFO). Coexiste con el pipeline SNS+SQS+notifier que ya existía de Cloud E4 (que sigue manejando `ticket.closed` → email) — el nuevo pipeline SQS-only del módulo `async/` maneja `ticket.expired` (watchdog) + endpoint de testing `POST /async/enqueue`.

**Por qué SQS standard y no FIFO**:
- El throughput del watchdog es bajo (1 ejecución/hora, batches pequeños). No necesitamos los 300 tx/s sin batching de FIFO.
- Cada `ticket.expired` es independiente — no hay orden de procesamiento relevante entre dos tickets distintos. La idempotencia se garantiza a nivel de DDB (ConditionExpression `estado = "Abierto"` antes del update).
- FIFO cuesta más por mensaje y limita el throughput global de la cola — sin beneficio funcional para nuestro caso.

**DLQ y redrive_policy** (módulo `infra/modules/async/`, recursos `aws_sqs_queue.main` + `aws_sqs_queue.dlq`):
- `max_receive_count = 3` (var `async_max_receive_count`). Después de 3 fallos del consumer, SQS mueve el mensaje a la DLQ. Default conservador — alineado con `notifications_max_receive_count` del pipeline viejo.
- `message_retention_seconds = 345600` (4 días) en la cola principal. Sobrevive a un outage prolongado del consumer.
- `dlq_message_retention_seconds = 1209600` (14 días, máximo SQS). La DLQ es para inspección post-incidente — ventana amplia para que un humano la revise.
- `visibility_timeout_seconds = 60`. Debe ser ≥ al timeout del consumer Lambda (30s). Si fuera menor, SQS reentrega antes de que el consumer termine y el mismo mensaje se procesa dos veces.

**Validación real con datos del dominio**: en el primer apply, el watchdog encontró 2 tickets vencidos. 1 se envió por email exitosamente (`sebastianalecio@gmail.com`, verificado en SES sandbox). El otro (`oyd-evidence-colab@oyd.local`, no verificado) falló 3 veces en SES → terminó en la DLQ. Eso valida el flow del redrive_policy con tráfico real, no sintético.

---

## 2. Event-driven architecture

**Trigger del compute** (módulo `infra/modules/compute/`, recurso `aws_lambda_event_source_mapping.sqs`):
- `batch_size = 1` (var `sqs_batch_size`). Un mensaje por invocación de Lambda — facilita debugging y aísla retries. Acepta menos throughput pero hoy el volumen es bajo.
- `maximum_batching_window_in_seconds = 0` (var). Sin esperar para acumular — entrega apenas hay un mensaje. Latencia mínima vs costo de invocaciones — válido al volumen actual.
- `bisect_batch_on_function_error` (var declarada en `compute/variables.tf` por compatibilidad de interfaz del módulo — pero AWS SQS NO soporta este parámetro; solo Kinesis y DynamoDB Streams. La var queda como no-op en el resource. Documentado en el bloque `aws_lambda_event_source_mapping.sqs` del módulo).

**Routing al DLQ**:
- Si el consumer tira un error (`throw`), Lambda devuelve el mensaje a la cola sin DeleteMessage.
- SQS espera el `visibility_timeout_seconds` (60s) y re-entrega el mismo mensaje al consumer.
- Cuando `receiveCount > max_receive_count` (3), SQS aplica el `redrive_policy` y mueve el mensaje a la DLQ.
- La DLQ NO tiene consumer — el equipo la revisa manualmente desde la consola SQS o via `aws sqs receive-message`.

**Acción esperada sobre mensajes dead-lettered**: revisión humana — el flow típico es leer el body del mensaje, verificar por qué falló (recipient no verificado en SES sandbox, payload malformado, ticket borrado del DDB), y o bien reenviar manualmente o descartar. Sin auto-replay porque la causa del DLQ suele ser un problema de datos, no transitorio.

**IAM least-privilege** (módulo `infra/modules/compute/main.tf`, `aws_iam_role_policy.lambda_sqs_consume`):
- Actions: `sqs:ReceiveMessage`, `sqs:DeleteMessage`, `sqs:GetQueueAttributes`.
- Resource: `var.sqs_queue_arn` (queue ARN exacto del módulo async/, sin wildcards).
- El consumer también tiene `s3:PutObject` scoped a `${bucket_arn}/async-events/*` (no a todo el bucket) y `ses:SendEmail` con condition `ses:FromAddress = soporte@lumenchat.app` (no a cualquier from).

---

## 3. Terraform environment layout y CD pipeline

**Estructura `infra/envs/`**:
- `infra/envs/dev/dev.tfvars` — environment dev, ya existía
- `infra/envs/dev/backend-dev.hcl` — config del S3 backend para dev, key `infra/envs/dev/terraform.tfstate`
- `infra/envs/staging/staging.tfvars` — nuevo en D4, 11 variables distintas a dev
- `infra/envs/staging/backend-staging.hcl` — key `infra/envs/staging/terraform.tfstate` (mismo bucket que dev, lock table compartido)

**Pattern elegido: separate backend.hcl** (no Terraform workspaces). El `backend.tf` root quedó como `backend "s3" {}` vacío; los workflows inyectan el `-backend-config=infra/envs/<env>/backend-<env>.hcl` en cada `init`. Razones:
- Explícito: el archivo `backend-<env>.hcl` documenta exactamente qué state apunta dónde, sin depender de "workspace seleccionado" silencioso.
- Sin footgun: olvidar `terraform workspace select <env>` antes de un plan apunta al workspace `default` y aplica contra el state equivocado silenciosamente. Con backends separados, omitir el `-backend-config` falla el init explícitamente.
- Migración del state previo (`infra/terraform.tfstate` → `infra/envs/dev/terraform.tfstate`) ejecutada con `terraform init -migrate-state -force-copy`. Backup del state original quedó en `s3://...backup-pre-d4`.

**Variables que difieren entre dev y staging (11 en total)**:
- `environment` = `"dev"` vs `"staging"`
- `attachments_bucket_name_prefix` = `pdds-oyd-attachments` vs `pdds-oyd-attachments-staging`
- `compute_memory_size` = 128 vs 256 (staging tiene más memoria para pruebas de carga)
- `dns_parent_domain` = `lumenchat.app` vs `""` (staging sin DNS custom para no chocar con dev por control del dominio)
- `dns_api_full_hostname` = `api.ticke-t.lumenchat.app` vs `""`
- `dns_enable_api_custom_domain` = `true` vs `false`
- `dns_enable_ses_domain_identity` = `true` vs `false`
- `ses_from_address` = `soporte@lumenchat.app` vs `""`
- `dns_ws_full_hostname` = `ws.ticke-t.lumenchat.app` vs `""`
- `dns_enable_ws_custom_domain` = `true` vs `false`
- `notifications_max_receive_count` = 3 vs 5 (staging usa retries más conservadores)

**Plan-artifact promotion** (workflows `.github/workflows/terraform-ci.yml` + `terraform-apply.yml`):
- Plan en la PR (`terraform-ci.yml`) corre `terraform plan -out=tfplan` y sube como artifact via `actions/upload-artifact@v4`. También sube el directorio `modules/compute/build/` (los zips de las Lambdas que el `data.archive_file` materializa en plan time — sin esto el apply en otro runner falla buscando los zips).
- Apply en el merge (`terraform-apply.yml`) busca el run de CI de la PR que produjo el merge commit (vía `actions/github-script` resolviendo `parents[1]` del merge commit), descarga el artifact con `actions/download-artifact@v4` y corre `terraform apply tfplan` — sin `-auto-approve`, sin re-plan.

**Approval gate de staging**:
- GitHub Environment `staging` configurado en Settings → Environments con required reviewer = `SebastianAlecio`.
- El job `apply-staging` declara `environment: staging` → pausa hasta aprobación humana en la UI.
- Cero overrides en el YAML del workflow para saltarse el gate — la protección está en el repository setting, no en el código.

**Secrets namespacing per environment**:
- Cada environment (dev + staging) tiene su propio set de secrets env-scoped: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`.
- Cuando un job declara `environment: dev`, GitHub resuelve `${{ secrets.AWS_ACCESS_KEY_ID }}` desde el env scope primero (fallback al repo level si no hay env-scoped).
- Patrón demostrado aunque hoy compartan valores (misma cuenta AWS). En el futuro si staging se separa a otra cuenta AWS, el cambio es solo cambiar el valor del secret env-scoped.

**Branch protection ruleset en `main`** (Settings → Rules → Rulesets):
- Status: Active. Target: `main`.
- Status checks required (deben matchear exactamente los nombres de los jobs del workflow `terraform-ci.yml`):
  - `Terraform fmt`
  - `Terraform validate`
  - `Terraform plan (dev)`
- Require a pull request before merging (no push directo a main).
- Require branches to be up to date before merging (evita que merges paralelos pisen state inconsistente).
- Block force pushes (incluso para admins — la historia de main es append-only).
- Restrict deletions (main no se puede borrar).

**Por qué require-branch-up-to-date + block-force-push juntos**: las dos reglas previenen escenarios de "merged code review skipped". Si una PR mergea sin estar al día con main, las checks corrieron contra una base distinta a lo que termina en main — la rama puede pasar checks individualmente pero romper main por interacciones. Forzando branch-up-to-date, los checks re-corren con la base real. Block-force-push previene que alguien (incluido un admin) sobreescriba commits ya mergeados con `git push --force`, lo que efectivamente borraría revisiones aprobadas del historial.

---

## 4. Scheduled jobs

**Función**: `pdds-oyd-watchdog-dev` (Lambda). Source en `infra/modules/compute/src/watchdog/index.js`.

**Comportamiento**: cada hora scanea `aws_dynamodb_table.tickets-dev` via GSI4 (`STATUS#Abierto`), filtra por `fecha_limite <= now`, marca los tickets vencidos como `Vencido` (con `ConditionExpression "estado = :estado_actual"` para evitar dobles updates), y publica un mensaje `{event:"ticket.expired", ticket_id, solicitante, ...}` al SQS del módulo async/. El async_consumer procesa el mensaje (audit log a S3 + email vía SES al solicitante).

**Cron expression**: `rate(1 hour)` (var `watchdog_schedule`). Razón: el SLA más corto en el dominio es 1 hora (prioridad Alta). Una ventana de chequeo de 1h significa que un ticket Alta puede tardar entre 1 y 2 horas en marcarse Vencido tras pasar el SLA. Aceptable para MVP — escalable a `rate(15 minutes)` o `rate(5 minutes)` si el negocio exige notificación más rápida.

**Timezone**: `America/Guatemala` (var `watchdog_timezone`). EventBridge Scheduler soporta IANA timezones nativos (legacy CloudWatch Events solo UTC). Para nuestro caso `rate(1 hour)` no usa timezone, pero la variable queda definida para futuras expressions tipo `cron(0 8 * * ? *)` (8am hora GT) que sí dependen del timezone.

**Recurso TF**: `aws_scheduler_schedule.this` (en `infra/modules/compute/main.tf`). Usamos el API nuevo (EventBridge Scheduler) en lugar del legacy `aws_cloudwatch_event_rule` — soporta timezones IANA nativos, schedules one-off y un IAM role dedicado por schedule (least-privilege más limpio).

**IAM role dedicado del scheduler** (`aws_iam_role.scheduler_invoke`):
- Trust policy: solo `scheduler.amazonaws.com` puede assume.
- Inline policy `aws_iam_role_policy.scheduler_invoke_lambda` con:
  - Action: `lambda:InvokeFunction`
  - Resource: ARN exacto del watchdog (`aws_lambda_function.this.arn`). Sin wildcards. Si en el futuro hay otro watchdog, requiere otro role distinto.

**Por qué el role del scheduler es más narrow que el execution role del Lambda**: el role del scheduler solo necesita invocar UNA función específica. El execution role del watchdog necesita Query/UpdateItem sobre DDB + SendMessage sobre SQS + write logs — múltiples acciones sobre múltiples recursos. Separar roles por responsabilidad (invocar vs ejecutar) es el patrón de least-privilege canónico de AWS.

---

## 5. End-to-end async proof

**Lenguaje y runtime**: JavaScript / Node.js 22 (arm64). Mismo runtime que las otras Lambdas del proyecto (tickets, chat-ws, notifier).

**Flow del enqueue → consumer → S3 + SES**:

1. **Producer (endpoint HTTP)**: `POST /async/enqueue` en API Gateway REST. Bajo Cognito authorizer (mismo authorizer que el resto del API). Backend: tickets Lambda (handler `handleAsyncEnqueue` en `infra/modules/compute/src/index.js`).
2. La Lambda recibe el body JSON, hace `SQSClient.send(SendMessageCommand)` apuntando a la queue del módulo async/ (env var `ASYNC_QUEUE_URL`).
3. Devuelve `HTTP 202` con el `MessageId` real que devolvió AWS (no un id hardcoded ni un id local).
4. **Trigger del consumer**: `aws_lambda_event_source_mapping` con event source el ARN de la queue. Lambda hace long-polling, recibe un record por invocación (batch_size=1).
5. **Consumer (async-consumer Lambda)**: handler en `infra/modules/compute/src/async-consumer/index.js`. Por cada record:
   - Parsea el body JSON.
   - Escribe UN objeto a S3: `s3://pdds-oyd-attachments-dev-<sufijo>/async-events/<messageId>.json` con el payload + metadata de procesamiento.
   - Loggea `async_consumer_ok` con `messageId`, `bucket`, `objectKey` para poder correlacionar un evento SQS con su objeto resultante en S3 desde CloudWatch Logs.
   - Si `payload.event === "ticket.expired"`, dispara branch adicional: SES SendEmail al `solicitante.correo` con el detalle del ticket vencido.

**Producer secundario**: el watchdog Lambda. Mismo flow desde el paso 4 — encola `{event:"ticket.expired", ...}` directo al async queue, el consumer lo procesa con el branch SES.

**IAM execution role del consumer**:
- `s3:PutObject` scoped a `arn:aws:s3:::pdds-oyd-attachments-dev-<sufijo>/async-events/*` (no a todo el bucket — solo al prefix async-events/).
- `sqs:ReceiveMessage`, `sqs:DeleteMessage`, `sqs:GetQueueAttributes` scoped al ARN exacto de la queue del módulo async/ (no wildcard).
- `ses:SendEmail`, `ses:SendRawEmail` con condition `StringEquals { "ses:FromAddress": "soporte@lumenchat.app" }`. El consumer puede mandar emails solo desde esa dirección — si el config cambia a otra from-address sin verificar primero, SES rechaza.
- `logs:CreateLogStream`, `logs:PutLogEvents` scoped a su propio log group `/aws/lambda/pdds-oyd-async-consumer-dev`.

**Object key en S3**: derivado del messageId que devuelve SQS al producer. Pattern: `async-events/<messageId>.json`. El messageId es único por invocación de SendMessage, así que la key es naturalmente única — no hay riesgo de colisión entre concurrent producers.

---

## 6. Trade-offs arquitectónicos

### 6.1 — SQS standard vs FIFO

Elegimos **SQS standard** sobre FIFO para el módulo async/. Trade-off real:

- **Standard**: throughput ilimitado, at-least-once delivery (un mensaje puede entregarse 2+ veces), orden no garantizado. ~$0.40/millón requests.
- **FIFO**: orden garantizado dentro de un MessageGroupId, exactly-once processing dentro de un dedup window de 5 min, throughput limitado a 300 tx/s sin batching (3000 con batching). ~$0.50/millón requests + costo de FIFO-specific operations.

Para nuestro caso (`ticket.expired` del watchdog, ~10-20 mensajes por hora máximo en producción real), el order no importa entre dos tickets distintos y los mensajes son inherentemente idempotentes por la ConditionExpression del UpdateItem en DDB. FIFO agrega complejidad (MessageGroupId, MessageDeduplicationId) sin beneficio. Standard es la elección obvia.

### 6.2 — Separate backend configs vs Terraform workspaces

Elegimos **separate backend.hcl per env** sobre Terraform workspaces. Trade-off:

- **backend-<env>.hcl**: explícito en archivos versionados; cada env tiene su key/bucket/lock-table documentado en el repo; olvidar `-backend-config=` rompe `init` con error claro; cambiar entre envs requiere `init -reconfigure` lo que fuerza re-init explícito.
- **Terraform workspaces**: una sola config de backend, switching con `terraform workspace select <env>`; menos archivos pero el "env actual" vive en el filesystem local (`.terraform/environment`), no en el repo. Forgetting el select es un pitfall conocido: aplica contra el workspace `default` (state distinto) sin avisar.

Workspaces son más concisos pero el footgun del select silencioso pesa más que la ergonomía de menos archivos. Para un equipo de 3 con turnover de quién toca infra, explícito gana.

---

## Evidence

Todos los archivos en `infra/evidence/`. Renderizados en `infra/README.md` bajo `## Evidence`.

| Archivo | Cubre |
|---|---|
| `async-foundation.txt` | Deliverable A — `terraform output` con queue URL/ARN, DLQ URL/ARN |
| `event-source-plan.txt` | Deliverable B — output de `aws lambda get-event-source-mapping` |
| `event-source.png` | Deliverable B — Console Lambda → Triggers tab del consumer |
| `scheduler-plan.txt` | Deliverable C — output de `aws scheduler get-schedule` |
| `scheduler.png` | Deliverable C — Console EventBridge → Schedules, tab Schedule pattern |
| `scheduler-target.png` | Deliverable C — tab Target con Lambda ARN + IAM role |
| `async-enqueue.txt` | Deliverable E — curl `POST /async/enqueue` mostrando HTTP 202 + MessageId |
| `async-consumer.png` | Deliverable E — CloudWatch log `async_consumer_ok` con messageId |
| `async-object.png` | Deliverable E — S3 console mostrando `async-events/<messageId>.json` |
| `github-environments.png` | Deliverable D — Settings → Environments mostrando dev + staging |
| `github-environments-staging.png` | Deliverable D — staging environment con required reviewer visible |
| `ruleset-config.png` | Deliverable D — branch ruleset activo en main (status + target + rules generales) |
| `ruleset-config-checks.png` | Deliverable D — required status checks del ruleset (fmt / validate / plan dev) |
| `ruleset-blocked-merge.png` | Deliverable D — PR mostrando merge bloqueado por check fallando |
| `ci-apply-dev.png` | Deliverable D — apply-dev verde post-merge |
| `ci-apply-staging.png` | Deliverable D — apply-staging pausado en approval gate |
| `ci-destroy.png` | Deliverable D — UI del workflow_dispatch del gated destroy |
| `ci-drift.png` | Deliverable D — drift detection con plan output en GITHUB_STEP_SUMMARY |
