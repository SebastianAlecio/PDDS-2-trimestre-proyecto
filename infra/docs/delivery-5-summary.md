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

**Decisión arquitectónica documentada:** la app de Ticke-T NO usa Secrets Manager para D5. Razón: la arquitectura es **100% serverless** sin database password. Persistencia: DynamoDB (no requiere password de conexión — usa IAM auth). Autenticación de usuarios: Cognito (no manejamos passwords ni JWT signing keys — Cognito los maneja). Comunicación inter-Lambda: vía SQS+SNS (mensajería autorizada por IAM, sin tokens compartidos).

El rubric pide migrar el `TF_VAR_db_password` introducido en D3 a Secrets Manager. **D3 nunca introdujo ese pattern** porque nunca tuvimos password — Cognito sustituyó por completo cualquier sistema de auth basado en credenciales locales. Documentamos esto como **partial coverage** del Deliverable B; cumplimos KMS al 100% pero no creamos un Secrets Manager secret artificial sólo para checkear un box del rubric (sería complejidad sin propósito real, contradice el principio "professional, no placeholders").

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
1. **Root account:** `kms:*` con condition `StringEquals kms:CallerAccount = 544341949288`. Patrón estándar de TF management; cumple el requirement de "no grants kms:* without condition".
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

El rubric ejemplifica con `:ref:refs/heads/main` singular, pero nuestro pipeline incluye PR plans, drift detection on schedule, y manual dispatch contra environments dev/staging. Las 4 conditions cubren cada trigger sin abrir el role a `*` ni a subjects de otros repos.

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

Resource: `aws_cloudwatch_dashboard.main` (nombre `pdds-oyd-dev-main`). Body construido con `jsonencode()` referenciando variables — sin heredoc con ARNs hardcodeados (pitfall del rubric).

3 widgets:
1. **API Gateway request volume + errors** — `AWS/ApiGateway` Count + 4XXError + 5XXError, stacked. Da la salud general del ingress.
2. **Lambda Errors por función** — `AWS/Lambda` Errors x5 functions (for loop sobre `lambda_function_names`). Permite ver qué Lambda está fallando sin tener que abrir cada log group.
3. **SQS depth (main + DLQ)** — `AWS/SQS` ApproximateNumberOfMessagesVisible sobre las 4 queues (2 main + 2 DLQ), overlaid. Detecta backups y mensajes muertos de un vistazo.

### Cost budget

Resource: `aws_budgets_budget.monthly`. **20 USD/mes**, notification al **80%** (= 16 USD) al SNS topic + email directo.

20 USD elegidos por análisis de baseline post-D4: el costo recurrente actual es < 1 USD/mes (free tier cubre Lambda invocations, DDB on-demand bajo, S3 storage < 1GB). 20 USD da margen para spikes durante demos/grading sin disparar notificación falsa, y al mismo tiempo es bajo enough para alertar antes de que un bug runaway (ej. Lambda en loop infinito) escale a cientos de USD.

## 5. Two architectural trade-offs

### (a) Sin Secrets Manager por arquitectura serverless

Aceptamos perder ~5 pts del Deliverable B en lugar de introducir un secret artificial. Justificación: el rubric espera un `TF_VAR_db_password` que migrar a Secrets Manager, pero la app es 100% serverless (DDB + Cognito) y nunca tuvo password. Las alternativas que evaluamos para "cumplir el rubric" eran:

- HMAC signing key entre watchdog → consumer (real defense in depth pero agregar lógica de signing/verification sin necesidad real)
- Admin API token para un endpoint del gerente (sólo tiene sentido si construimos el endpoint, fuera del scope D5)

Ambas serían complejidad sin propósito operacional real — contradicen el principio "professional, no placeholders". Documentamos la limitación explícitamente, mantenemos KMS al 100%. Cae a "Partially Meets" en B → ~7/12 pts esperados.

### (b) HTTP 301 redirect explícito solo en CloudFront, no en API Gateway

El rubric D exige "HTTP 301 redirect ... verifiable with curl ... do not simply close port 80". CloudFront satisface esto con `viewer_protocol_policy = "redirect-to-https"`. API Gateway custom domains (REST regional + WS v2) **no exponen port 80** por decisión arquitectónica de AWS — no es algo que cerramos, AWS literalmente nunca lo abre.

Resultado: los 3 endpoints públicos (`api.*`, `ws.*`, `app.*`) son HTTPS-only y cero plaintext es alcanzable (cumple el espíritu del requisito). Pero solo CloudFront tiene el 301 explícito verificable. Cae a "Partially Meets" en D → ~5-6/8 pts esperados.

Alternativa rechazada: poner CloudFront delante de api.* y ws.* también. Habría sumado ~6-8h de trabajo + riesgo de romper WebSocket (CloudFront limita conexiones a 60 min, requeriría reconnect en frontend) + latencia permanente + complejidad CORS para ganar ~3 pts. Cost/benefit malo.

---

## Public endpoints (Deliverable D — required listing)

| URL | TLS | Cert source | Redirect 301 | Notas |
|---|---|---|---|---|
| `https://api.ticke-t.lumenchat.app` | ✅ | ACM wildcard `*.ticke-t.lumenchat.app` de D3 (regional us-east-1, vivido por API GW custom domain) | ❌ (AWS no expone port 80) | REST API tickets |
| `wss://ws.ticke-t.lumenchat.app` | ✅ | mismo wildcard cert reutilizado | ❌ (AWS no expone port 80) | WebSocket chat |
| `https://app.ticke-t.lumenchat.app` | ✅ | mismo wildcard referenciado vía `data "aws_acm_certificate"` (cumple "no duplicate") | ✅ HTTP 301 explícito (CloudFront `viewer_protocol_policy = "redirect-to-https"`) | Frontend SPA via CloudFront |

**Cobertura HTTPS total: 3/3 (100%).** Redirect 301 explícito: 1/3 (CloudFront only, ver trade-off (b)).

Evidencia: `infra/evidence/tls-curl.txt` con outputs de `curl -v` para cada uno.

---

## Submission

- Tag: `oyd-delivery-5` pushed.
- Summary: este archivo (`infra/docs/delivery-5-summary.md`).
- IaC coverage: archivo separado (`infra/docs/iac-coverage.md`).
- Evidence: 14 archivos en `infra/evidence/`.
- README evidence section: `infra/README.md` renderiza todos los archivos inline.

## Clean state proof trigger

Esta seccion existe para garantizar que el commit del clean-state proof toque `infra/**` y dispare el path filter de `terraform-apply.yml`. El apply correspondiente recrea los 237 recursos desde un state list vacio.
