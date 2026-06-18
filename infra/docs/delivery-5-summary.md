# Delivery 5 — Security, Observability & One-Click Deployment

**Tag:** `oyd-delivery-5`
**Course:** Optimizations and Performance (PDDS, Galileo)
**Team:** SebastianAlecio / dacaslles / nydiamonica2002

Esta entrega cierra los 2 pilares restantes del stack — **Security** y **Observability** — y prueba que un solo `git push` a main provisiona el sistema completo desde cero.

## 1. IAM y secrets design

### Roles (módulo `infra/modules/iam/`)

El refactor centraliza 7 roles least-privilege, uno por servicio. Antes de D5 todos vivían inline en `modules/compute/` (1 rol compartido por las 5 Lambdas + 1 scheduler role). Ahora cada servicio tiene su propio rol con policies scopeadas a ARNs exactos, sin wildcards en Action ni Resource.

| Rol | Trust principal | Actions principales | Resource scope |
|---|---|---|---|
| `pdds-oyd-tickets-lambda-dev` | `lambda.amazonaws.com` | logs, ddb CRUD, s3 attachments R/W, cognito Admin, sns:Publish, sqs:SendMessage, execute-api:ManageConnections | log group del tickets Lambda, tabla DDB + `/index/*`, `attachments_bucket/attachments/*`, user pool, topic SNS, async queue, ws_api/*/POST/@connections/* |
| `pdds-oyd-chat-ws-lambda-dev` | `lambda.amazonaws.com` | logs, ddb CRUD, s3 attachments R/W, execute-api:ManageConnections | mismo scope DDB y S3 que tickets, log group propio |
| `pdds-oyd-notifier-lambda-dev` | `lambda.amazonaws.com` | logs, sqs Consume sobre notifications queue, ddb GetItem/PutItem (idempotency), ses:SendEmail | notifications_sqs_queue, tabla DDB, identity SES arn:...:identity/lumenchat.app con condition ses:FromAddress |
| `pdds-oyd-async-consumer-lambda-dev` | `lambda.amazonaws.com` | logs, sqs Consume sobre async queue, s3 PutObject async-events/*, ses:SendEmail | async_sqs_queue, `attachments_bucket/async-events/*`, mismo SES scope |
| `pdds-oyd-watchdog-lambda-dev` | `lambda.amazonaws.com` | logs, ddb Query sobre GSI4 + UpdateItem, sqs:SendMessage | tabla DDB + `/index/GSI4`, async_sqs_queue |
| `pdds-oyd-scheduler-invoke-dev` | `scheduler.amazonaws.com` | lambda:InvokeFunction | ARN exacto del watchdog Lambda |
| `pdds-oyd-ci-runner-dev` | `Federated` (OIDC GH) | AdministratorAccess (managed) | * (justificado abajo) |

**SES policy:** antes era `Resource = "*"` con `Condition StringEquals ses:FromAddress`. Ahora `Resource = arn:aws:ses:us-east-1:544341949288:identity/lumenchat.app` + el condition se mantiene como defense in depth. Sin wildcards.

**Permisos del ci_runner:** AdministratorAccess managed policy. Justificación: terraform plan/apply gestiona crear/destruir IAM roles, KMS key policies, OIDC providers, Route 53 zonas, CloudFront distributions, S3 bucket policies. Una custom policy mínima sería extensa (varios cientos de líneas), frágil ante upgrades del provider, y requeriría mantenimiento manual constante. El patrón estándar para CI/CD de Terraform es PowerUserAccess + IAMFullAccess, o directamente AdministratorAccess. Adoptamos AdministratorAccess porque el ARN es scoped al repo via OIDC trust policy (las creds nunca existen como secret).

### Secrets / Secrets Manager

**Decisión arquitectónica:** la app de Ticke-T NO usa Secrets Manager. Razón: la arquitectura es **100% serverless** sin database password. Persistencia: DynamoDB (no requiere password de conexión — usa IAM auth). Autenticación de usuarios: Cognito (no manejamos passwords ni JWT signing keys — Cognito los maneja). Comunicación inter-Lambda: vía SQS+SNS (mensajería autorizada por IAM, sin tokens compartidos).

Como no hay credenciales persistentes que migrar, no introducimos un secreto artificial en Secrets Manager solo para tener uno. La capa de protección de data en reposo queda cubierta por completo por la CMK de KMS (sección 2). Si en el futuro la app suma un componente que sí requiera credencial almacenada (ej. integración con un servicio externo de email transaccional con API key), el wiring del modulo iam/ ya está listo para sumar `aws_secretsmanager_secret` + permitir `secretsmanager:GetSecretValue` al rol del consumer correspondiente.

## 2. KMS key management

Una sola CMK customer-managed encripta los 2 stores de data del proyecto.

- **Alias:** `alias/pdds-oyd-dev`
- **Key ARN:** `arn:aws:kms:us-east-1:544341949288:key/f0e632bd-24e5-41a4-abdd-75b15bb069f9`
- **KeyManager:** `CUSTOMER`
- **Key rotation:** habilitada (annual automatic rotation)
- **Deletion window:** 7 días

**Encripta:**
- S3 bucket `pdds-oyd-attachments-dev-b16b7b45` (upgrade SSE-S3 → aws:kms, `bucket_key_enabled = true` para reducir costo KMS hasta 99%)
- DynamoDB `tickets-dev` (SSEType = KMS, KMSMasterKeyArn = el CMK)

**Key policy** (3 statements, todos scopeados):
1. **Root account:** `kms:*` con condition `StringEquals kms:CallerAccount = 544341949288`. Patrón estándar de TF management — la condition restringe el uso a llamadas originadas dentro de la cuenta dueña de la key, no es un grant abierto al principal root.
2. **Service principals:** `s3.amazonaws.com` + `dynamodb.amazonaws.com` con Encrypt/Decrypt/GenerateDataKey/etc, condition `StringEquals kms:ViaService = ["s3.us-east-1.amazonaws.com", "dynamodb.us-east-1.amazonaws.com"]`. Bloquea uso de la key fuera de estos servicios.
3. **Lambda consumer roles:** los 5 execution roles con `Decrypt` + `GenerateDataKey` + `DescribeKey`, condition `kms:ViaService` igual al statement 2. No permite Decrypt directo sobre payloads arbitrarios — solo a través de S3/DDB.

El bucket de assets del frontend (`pdds-oyd-frontend-dev-*`) usa SSE-S3 (no KMS): son archivos públicos servidos vía CloudFront, no hay secret-at-rest a proteger; KMS sumaría costo sin beneficio.

## 3. OIDC federation

**OIDC provider** (creado vía Terraform, `aws_iam_openid_connect_provider.github`):
- URL: `https://token.actions.githubusercontent.com`
- Audience: `sts.amazonaws.com`
- Thumbprints: ambos publicados oficialmente por AWS (rotación segura)
- ARN: `arn:aws:iam::544341949288:oidc-provider/token.actions.githubusercontent.com`

**Trust policy del `ci_runner` role** scopeada al repo `SebastianAlecio/PDDS-2-trimestre-proyecto` con 4 subject claims aceptados (`StringLike`, ninguno wildcard):

```
repo:SebastianAlecio/PDDS-2-trimestre-proyecto:ref:refs/heads/main
repo:SebastianAlecio/PDDS-2-trimestre-proyecto:pull_request
repo:SebastianAlecio/PDDS-2-trimestre-proyecto:environment:dev
repo:SebastianAlecio/PDDS-2-trimestre-proyecto:environment:staging
```

Nuestro pipeline tiene 4 triggers distintos que necesitan asumir el ci_runner role: push directo a main + drift detection on schedule (`ref:refs/heads/main`), PR plans (`pull_request`), y workflow_dispatch contra los environments dev/staging (`environment:dev`, `environment:staging`). Las 4 conditions cubren cada trigger sin abrir el role a `*` ni a subjects de otros repos.

**Workflows migrados** (4 + 1 nuevo): `terraform-ci.yml`, `terraform-apply.yml`, `terraform-destroy.yml`, `terraform-drift.yml`, `frontend-deploy.yml`. Todos tienen `permissions: id-token: write` y reemplazaron los `aws-access-key-id` / `aws-secret-access-key` por `role-to-assume: ${{ vars.AWS_ROLE_ARN_DEV }}` o `AWS_ROLE_ARN_STAGING`.

**Secrets eliminados** (post-validación, manual desde GH Settings):
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

Evidencia: `infra/evidence/oidc-secrets-removed.png`.

## 4. Observability design

Módulo `infra/modules/observability/` con 4 componentes monitorizables.

### Metric alarms (8 total)

| Alarm | Threshold | Period | Razón |
|---|---|---|---|
| `pdds-oyd-dev-chat-message-handler-dev-errors` | > 5 errors | 5 min | 5 errors = ~1/min sostenido por 5 min → handler con bug recurrente. Threshold bajo evita ruido de errores transitorios aislados. |
| `pdds-oyd-dev-chat-ws-dev-errors` | > 5 | 5 min | igual razón |
| `pdds-oyd-dev-ticket-notifier-dev-errors` | > 5 | 5 min | igual |
| `pdds-oyd-dev-pdds-oyd-async-consumer-dev-errors` | > 5 | 5 min | igual |
| `pdds-oyd-dev-pdds-oyd-watchdog-dev-errors` | > 5 | 5 min | watchdog corre 1/hora; 5 errors en 5 min = corrió 5 veces seguidas con fallo. Edge case grave. |
| `pdds-oyd-dev-ticke-t-async-dev-dlq-dlq-depth` | > 0 | 1 min | CUALQUIER mensaje en DLQ = procesamiento fallido. Threshold tightest posible. |
| `pdds-oyd-dev-ticket-notifications-dev-dlq-dlq-depth` | > 0 | 1 min | igual |
| `pdds-oyd-dev-api-5xx` | > 10 | 5 min | API GW devuelve 5XX cuando la Lambda devuelve 5XX o cuando el integration falla. 10/5min = >2/min sostenido = problema activo. |

Todas wired al SNS topic `arn:aws:sns:us-east-1:544341949288:pdds-oyd-dev-alarms` con email subscription a `sebastianalecio@gmail.com`.

### Dashboard

Resource: `aws_cloudwatch_dashboard.main` (nombre `pdds-oyd-dev-main`). Body construido con `jsonencode()` referenciando variables — sin heredoc con ARNs hardcodeados, así los nombres de Lambdas y queues cambian automáticamente entre environments y no hay valores duplicados en el código.

3 widgets:
1. **API Gateway request volume + errors** — `AWS/ApiGateway` Count + 4XXError + 5XXError, stacked. Da la salud general del ingress.
2. **Lambda Errors por función** — `AWS/Lambda` Errors x5 functions (for loop sobre `lambda_function_names`). Permite ver qué Lambda está fallando sin tener que abrir cada log group.
3. **SQS depth (main + DLQ)** — `AWS/SQS` ApproximateNumberOfMessagesVisible sobre las 4 queues (2 main + 2 DLQ), overlaid. Detecta backups y mensajes muertos de un vistazo.

### Cost budget

Resource: `aws_budgets_budget.monthly`. **20 USD/mes**, notification al **80%** (= 16 USD) al SNS topic + email directo.

20 USD elegidos por análisis de baseline post-D4: el costo recurrente actual es < 1 USD/mes (free tier cubre Lambda invocations, DDB on-demand bajo, S3 storage < 1GB). 20 USD da margen para spikes durante demos/grading sin disparar notificación falsa, y al mismo tiempo es bajo enough para alertar antes de que un bug runaway (ej. Lambda en loop infinito) escale a cientos de USD.

## 5. Two architectural trade-offs

### (a) Sin Secrets Manager — arquitectura serverless sin credenciales persistentes

La aplicación no usa Secrets Manager. Persistencia (DynamoDB) y autenticación (Cognito) son servicios fully-managed que no requieren passwords almacenadas. La comunicación entre Lambdas pasa por SQS+SNS autorizado por IAM, sin tokens compartidos.

Alternativas que consideramos para introducir un secret y descartamos:
- **HMAC signing key entre watchdog → consumer**: agregaría lógica de signing/verification sin un riesgo concreto que justifique la complejidad operacional. Los mensajes de SQS ya están autorizados por IAM (sólo el watchdog tiene `sqs:SendMessage` sobre la queue).
- **Admin API token para un futuro endpoint del gerente**: solo aplicaría una vez construido ese endpoint, fuera del scope actual.

La capa de protección de data en reposo queda cubierta por la CMK de KMS (S3 + DynamoDB encriptados con customer-managed key, sección 2). La autenticación de usuarios y el acceso programático a recursos AWS quedan cubiertos por Cognito (issuer JWT, sección OIDC) y los IAM roles least-privilege (sección 1).

### (b) HTTP 301 redirect implementado en CloudFront, no a nivel API Gateway

CloudFront implementa el redirect 301 desde port 80 a port 443 via `viewer_protocol_policy = "redirect-to-https"`. Verificable con `curl -v http://app.ticke-t.lumenchat.app/` → HTTP 301 Moved Permanently → `https://app.ticke-t.lumenchat.app/`.

Los API Gateway custom domains (REST regional + WS v2) **no exponen port 80**. Cualquier intento de conectarse en HTTP es rechazado a nivel TCP por la arquitectura del servicio AWS. Resultado: los 3 endpoints públicos (`api.*`, `ws.*`, `app.*`) son HTTPS-only y cero plaintext es alcanzable desde el exterior.

Alternativa que consideramos: poner CloudFront delante de api.* y ws.* también para tener el redirect 301 explícito en los 3. La descartamos por:
- **WebSocket sobre CloudFront limita conexiones a 60 minutos** — implicaría agregar reconnect-with-resume al frontend chat.
- **Latencia adicional permanente** (~20-50 ms por hop) en cada request del API.
- **Complejidad CORS extra** entre el dominio CloudFront y el API.
- **Riesgo de romper la aplicación** que ya está funcionando estable end-to-end.

---

## Public endpoints

| URL | TLS | Cert source | Redirect HTTP→HTTPS | Notas |
|---|---|---|---|---|
| `https://api.ticke-t.lumenchat.app` | ✅ | ACM wildcard `*.ticke-t.lumenchat.app` de D3 (regional us-east-1, vivo por API GW custom domain) | port 80 cerrado (no listener) | REST API tickets |
| `wss://ws.ticke-t.lumenchat.app` | ✅ | mismo wildcard cert reutilizado | port 80 cerrado (no listener) | WebSocket chat |
| `https://app.ticke-t.lumenchat.app` | ✅ | mismo wildcard referenciado vía `data "aws_acm_certificate"` (sin duplicar resource) | ✅ HTTP 301 (CloudFront `viewer_protocol_policy = "redirect-to-https"`) | Frontend SPA via CloudFront |

**Cobertura HTTPS total: 3/3 (100%).** Redirect 301 explícito implementado en CloudFront; los API Gateway custom domains son HTTPS-only sin listener HTTP.

Evidencia: `infra/evidence/tls-curl.txt` con outputs de `curl -v` para cada uno.

---

## Submission

- Tag: `oyd-delivery-5` pushed.
- Summary: este archivo (`infra/docs/delivery-5-summary.md`).
- IaC coverage: archivo separado (`infra/docs/iac-coverage.md`).
- Evidence: 14 archivos en `infra/evidence/`.
- README evidence section: `infra/README.md` renderiza todos los archivos inline.
