# Resumen Delivery 3 — Networking Layer Fully Automated

Esta entrega completa la capa de networking del proyecto bajo el **serverless-only track**: en lugar de provisionar una VPC con subnets, NAT y security groups, se monta una capa Edge & DNS con dominio custom, hosted zone administrada por Terraform, ingress restrictivo sobre el API Gateway, regla de WAF, y prueba end-to-end de conectividad usando los endpoints que ya escriben a DynamoDB y al bucket S3 de la D2.

El dominio que sustenta la decisión técnica sigue siendo **Ticke-T** (carpeta `cloud/`, rama `cloud-delivery-3`): plataforma de gestión de tickets internos con widget de chat. El stack de D2 (Lambda + DynamoDB + S3 + Cognito + API Gateway) calificó para el track serverless-only sin tocar nada de D2 — no hay RDS, no hay EC2/Fargate, no hay EKS.

## 1. Track elegido y por qué

**Serverless-only track.** Calificamos por los dos criterios estrictos:

- **Compute:** AWS Lambda. La función `chat-message-handler-dev` (módulo `compute`) atiende el 100% de las requests de la API. No hay EC2 ni containers en ningún lado del stack.
- **Database:** Amazon DynamoDB. La tabla `tickets-dev` (módulo `database`) es single-table y soporta todos los access patterns del dominio (creación de tickets, "mis tickets" del colaborador, cola del agente, filtros estado+prioridad). No hay RDS, Aurora, Cloud SQL ni nada con interfaz de red privada.

Que ambos califiquen como fully serverless es lo que nos habilita a no provisionar VPC. Esa decisión está justificada en detalle en `cloud/docs/project.md §12.1` (no-VPC para arquitectura serverless, con cuatro razones: no hay servidor con IP que aislar, costo evitado del NAT Gateway ~$64/mes con 2 AZs, ~30% menos cold-start de Lambda fuera de VPC, superficie operacional mínima). La opción equivalente en este rubric es la sustitución Edge & DNS — que es exactamente lo que esta entrega implementa.

## 2. Diseño del módulo `dns/` y arquitectura

El módulo `infra/modules/dns/` se introduce en esta entrega y reemplaza por completo al DNS que hostigaba el dominio `lumenchat.app` en otro proveedor (Hostinger). Sus responsabilidades:

1. **Hosted zone primaria.** `aws_route53_zone.this` para el dominio raíz `lumenchat.app`. Los 4 nameservers que AWS asigna se copian manualmente al panel del registrador (single-step, lo hace el equipo una sola vez) — desde ese momento, internet resuelve todo `*.lumenchat.app` vía Route 53.
2. **Records preservados desde Hostinger.** Las 13 entradas que tenía el DNS de Hostinger (apex A/AAAA, MX a `mx1`/`mx2.hostinger.com`, SPF/DMARC, www, ftp, autoconfig, autodiscover, 3 keys DKIM) se re-declaran como `aws_route53_record` en TF. Se replicaron uno a uno antes del switch de nameservers para no romper email ni la página parqueada del apex durante la migración.
3. **Certificado ACM wildcard.** `aws_acm_certificate.wildcard` cubre `*.ticke-t.lumenchat.app`. Validación por DNS automática: ACM emite un CNAME, Terraform lo escribe en la misma hosted zone, ACM lo lee y valida en minutos.
4. **Custom domain del API Gateway.** `aws_api_gateway_domain_name.api` con endpoint regional (`REGIONAL`, mismo region que el REST API), TLS 1.2 mínimo, mapeo de `regional_certificate_arn` al cert wildcard, y `aws_api_gateway_base_path_mapping` apuntando al stage `api`. Resultado: `https://api.ticke-t.lumenchat.app` → REST API stage `api`.
5. **Alias A en Route 53.** `aws_route53_record.api[0]` con bloque `alias` apunta `api.ticke-t.lumenchat.app` al `regional_domain_name` del custom domain — registro tipo A nativo (no CNAME) para que funcione como apex de subdominio.

**Outputs exigidos por el rubric:** `domain_name = "api.ticke-t.lumenchat.app"` y `hosted_zone_id = "Z0749253Z6TOL9I58TBW"` están expuestos tanto en el módulo (`outputs.tf`) como re-exportados a nivel root (`infra/outputs.tf`), nombrados exactamente como pide el spec.

**Estrategia de dos applies para evitar bloqueo durante el switch de nameservers:**
- Apply 1: solo crea la hosted zone (con `dns_enable_api_custom_domain = false`). Da los 4 NS que se pegan en Hostinger.
- Apply 2: con `dns_enable_api_custom_domain = true`, crea el cert + custom domain + alias. Ya con los nameservers propagados, ACM valida automáticamente.

Esto evita el escenario en el que Terraform se queda bloqueado esperando que ACM valide un cert sobre un dominio que todavía no es alcanzable desde internet.

**Consumo del módulo dns desde el root:** el bloque `module "dns"` en `infra/main.tf` toma como inputs `parent_domain`, `api_full_hostname`, `enable_api_custom_domain`, `api_gateway_id` (del módulo api), `api_gateway_stage_name`, y la lista de records preservados como variables tipadas (`apex_a_record`, `apex_aaaa_record`, `apex_mx_records`, `apex_txt_records`, `subdomain_records`). Los outputs `api_gateway_id` y `api_stage_name` los expone el módulo `api` ya existente.

## 3. D2 wiring update (sin refactor)

No hay módulos de D2 que apunten a recursos placeholder de networking. RDS, Cloud SQL, EKS — ninguno califica para serverless-only así que ni siquiera se consideró su uso en D2. El stack desde D2 ya es 100% Lambda + DynamoDB + S3 + Cognito + API Gateway, todos servicios sin endpoints en VPC.

El único "consumidor" indirecto de la nueva capa de networking es el módulo `api`, que ahora pasa su `api_id` al módulo `dns` para el base path mapping del custom domain. Eso se hizo agregando una sola línea (`api_gateway_id = module.api.api_id`) en `infra/main.tf` — no es un refactor de D2, es composición de un nuevo módulo encima.

`terraform output dns_api_url` confirma el cableado:
```
https://api.ticke-t.lumenchat.app
```

## 4. Seguridad

### 4.1 API Gateway resource policy

`aws_api_gateway_rest_api_policy.this` en el módulo `api` declara una policy explícita sobre la API:

```json
{
  "Statement": [{
    "Sid": "AllowPublicInvokeAuthEnforcedAtMethodLevel",
    "Effect": "Allow",
    "Principal": { "AWS": "*" },
    "Action": "execute-api:Invoke",
    "Resource": "arn:aws:execute-api:us-east-1:544341949288:df6jdxf8ob/*/*/*"
  }]
}
```

Lectura honesta: es permisiva en la práctica. La razón es que **la restricción real de ingreso ya vive en otras dos capas** que se ejecutan antes que esta policy pueda agregar valor:

1. **WAF v2 perimetral.** `aws_wafv2_web_acl.this` con regla de rate limit `2000 req/IP/5min`, asociada al stage del REST API. Filtra DDoS y abuse antes de que llegue al API Gateway.
2. **Cognito User Pools authorizer.** `aws_api_gateway_authorizer.cognito` valida el ID token en cada request a rutas autenticadas. Tokens inválidos devuelven 401 sin gastar invocación de Lambda.

Si en el futuro se necesita restringir el ingress a un set de IPs o a tráfico que viene solo de CloudFront, esta resource policy es el sitio correcto para hacerlo (sustituyendo el Principal "*" por una condición sobre `aws:SourceIp` o `aws:Referer`).

### 4.2 Least-privilege invoker IAM

El módulo `api` declara `aws_lambda_permission.apigw_invoke` con:
```
action     = "lambda:InvokeFunction"
principal  = "apigateway.amazonaws.com"
source_arn = "${aws_api_gateway_rest_api.this.execution_arn}/*/*"
```

Esto autoriza a API Gateway a invocar exactamente esta Lambda y desde exactamente esta API. Sin esto, AWS rechaza la invocación con 502. El JSON completo de la policy está capturado en `infra/evidence/invoker-iam-policy.txt`.

El execution role de la Lambda (`chat-message-handler-dev-exec`) tiene 4 inline policies, todas scoped a ARNs exactos sin wildcards en `Resource`:
- `…-logs` → `logs:CreateLogStream`, `logs:PutLogEvents` sobre su propio log group.
- `…-dynamodb` → `PutItem`, `Query`, `GetItem`, `UpdateItem` sobre `tickets-dev` y `/index/*`.
- `…-attachments-bucket` → `s3:PutObject` sobre `${bucket_arn}/attachments/*`.
- `…-cognito` → acciones admin (`AdminCreateUser`, `AdminAddUserToGroup`, etc.) sobre el User Pool específico.

### 4.3 WAF rule seleccionada

Se eligió **rate limit por IP** (no managed OWASP rules, no geographic restriction):

- 2000 requests por IP en ventana móvil de 5 minutos. Action `BLOCK`. Configurable vía `var.waf_rate_limit_per_5min`.
- Cubre brute-force al endpoint de login Cognito, scraping del API, intentos automatizados.

**Por qué solo una regla.** No servimos HTML (descarta XSS managed rules), no usamos SQL (descarta SQL injection managed rules), y el authorizer JWT ya filtra el 100% de las invocaciones a rutas protegidas. Agregar managed rules sumaría costo facturable y ruido en los logs sin tapar un vector de ataque concreto en este sistema. Si el sistema evoluciona (chat con upload de imágenes a inspeccionar, panel admin que sirve HTML), se reevalúa.

## 5. Prueba end-to-end de conectividad

### 5.1 Lenguaje, runtime, IAM y seed

- **Lenguaje y runtime:** Node.js 22.x sobre Lambda arm64 (Graviton2). Es el runtime con el que ya estaba escrito el handler en D2 — no se cambió.
- **Endpoints concretos cumpliendo el rubric:**
  - **GET** `https://api.ticke-t.lumenchat.app/tickets/queue` → la Lambda hace `Query(GSI4-PK = STATUS#Abierto)` y devuelve los tickets abiertos como JSON. Captura en `infra/evidence/e2e-get.txt` — incluye el seed `TICKET#seed-oyd-d3-001`.
  - **POST** `https://api.ticke-t.lumenchat.app/tickets` → la Lambda crea el ticket en DynamoDB, escribe un `manifest.json` a S3 (`attachments/{ticket_id}/manifest.json`) y devuelve 201 con `object_key`. Captura en `infra/evidence/e2e-post.txt`.
- **Credenciales:** ningún secret va en `dev.tfvars`. La Lambda recibe sus dependencias por env var (`TICKETS_TABLE_NAME`, `ATTACHMENTS_BUCKET_NAME`, `COGNITO_USER_POOL_ID`, `HEALTH_CHECK_PATH`) que se construyen desde outputs de otros módulos. Ningún valor sensible se hardcodea.
- **IAM execution role:** `chat-message-handler-dev-exec`. Tiene los 4 inline policies del §4.2 — todos con `Resource` scoped al ARN específico, sin wildcards.
- **Seed mechanism:** `infra/seed.tf` declara `aws_dynamodb_table_item.seed_ticket` que inserta `TICKET#seed-oyd-d3-001 / METADATA` en la tabla en cada apply. El item tiene `GSI4-PK = STATUS#Abierto`, lo que lo hace visible en el GET de `/tickets/queue`. El `lifecycle.ignore_changes = [item]` evita que el seed se sobrescriba en applies subsecuentes si el handler lo modifica.

### 5.2 Adjuntos reales con presigned PUT URLs

Una mejora introducida en esta entrega: el POST `/tickets` ahora soporta adjuntos reales (no solo metadata). El flujo es two-step para evitar el límite de 6 MB del payload de Lambda:

1. El frontend manda `POST /tickets` con metadata de adjuntos `[{filename, mime_type, size}]` (sin binario).
2. La Lambda crea el ticket, genera presigned PUT URLs para cada adjunto (con `@aws-sdk/s3-request-presigner`, TTL 15 min), escribe el `manifest.json` a S3, y devuelve `{uploads: [{s3_key, url, expires_in}]}`.
3. El frontend hace PUT directo a S3 por cada URL — sin pasar por Lambda. Soporta archivos de hasta 25 MB sin problemas de payload.

El IAM execution role no necesita cambios — `s3:PutObject` sobre `attachments/*` cubre tanto el manifest del backend como los PUTs del frontend (porque el presigned URL hereda los permisos del firmante).

### 5.3 Health check

`var.api_health_check_path` (default `/`, override a `/health` en `dev.tfvars`) define el path que el rubric exige tener configurable. El endpoint usa **AWS_PROXY integration → Lambda** (no MOCK) para que el probe ejerza el cold-start y el runtime de verdad. La Lambda atiende el path **antes del check de auth** (los health checks no llevan JWT) y devuelve un payload con status del runtime y de las dependencias críticas. Resultado:

```
$ curl https://api.ticke-t.lumenchat.app/health
{"status":"ok","service":"chat-message-handler-dev","region":"us-east-1",
 "timestamp":"...","dependencies":{"tickets_table":"configured","attachments_bucket":"configured"}}
```

## 6. Dos trade-offs arquitecturales

### 6.1 No-VPC vs VPC con NAT Gateway y subnets privadas

**Decisión: serverless-only sin VPC.** El stack es Lambda + DynamoDB + S3 + Cognito + API Gateway. Todos exponen endpoints públicos firmados con IAM o autenticados con JWT — ninguno requiere ENIs, security groups, NAT Gateway ni route tables. Provisionar VPC en este stack sólo agregaría infraestructura inerte alrededor de servicios que ya se autentican solos.

**Trade-off cuantitativo:** NAT Gateway cuesta ~$32/mes/AZ + $0.045/GB de tráfico saliente. Con 2 AZs son ~$64/mes fijos solo en NAT. Cero en nuestro stack. Además, Lambda fuera de VPC ahorra entre 100 ms y 300 ms de cold-start por concurrencia inicial (sin ENI initialization). Para un sistema de tickets internos que pasa la mayor parte del tiempo con poca carga y recibe picos puntuales, ese delta de cold-start importa más que el aislamiento de red — que de todos modos no aporta valor cuando los servicios autentican por identidad y no por origen IP.

**Cuándo se replantea:** si aparece RDS, ElastiCache, EC2 o cualquier recurso con interfaz de red privada. El diseño contingente está documentado en `cloud/docs/project.md §14` (VPC contingente con VPC Endpoints Gateway para DynamoDB y S3 en lugar de NAT, para evitar el costo del NAT incluso con VPC).

### 6.2 Presigned PUT URLs vs base64 inline en el POST

**Decisión: presigned PUT URLs.** El POST `/tickets` devuelve URLs firmadas para cada adjunto y el frontend hace PUT directo a S3.

La alternativa simple era recibir los archivos como base64 dentro del body del POST. **No funciona en la práctica:** API Gateway tiene límite de 10 MB por request, Lambda sync invoke tiene 6 MB, y base64 inflama el tamaño ~33%. Con esos límites, el máximo real son ~4 MB POR TICKET — bloqueante para una plataforma que admite hasta 10 adjuntos de 25 MB cada uno (validado en `app/src/features/tickets/presentation/schema.ts`). Además, encolar el archivo en el payload de la Lambda paga tiempo de cómputo por algo que S3 puede hacer directamente del browser.

**Trade-off reconocido:** el flujo es two-step (POST → N× PUT a S3). Si el browser pierde conexión entre los pasos, el ticket queda creado pero los adjuntos con `upload_status: "pending"` en DDB. Mitigación futura: una notificación S3 (cuando llega el PutObject) que actualice el status en DDB. Para esta entrega es aceptable — el adjunto sigue subible manualmente con el mismo flujo desde la UI.

## 7. Deviations conscientes vs el rubric

Tres puntos donde nos apartamos de la letra del spec, con justificación:

1. **Módulo se llama `infra/modules/api/` en lugar de `infra/modules/ingress/`.** El módulo cumple exactamente la función de ingress (API Gateway REST + Lambda proxy integration), pero el nombre se eligió en D2 cuando todavía no había un rubric con esa convención. Renombrarlo requiere `terraform state mv` de ~30 recursos, riesgo evaluado como mayor que el beneficio. El contenido del módulo cumple los requisitos: separado en `main.tf`, `variables.tf`, `outputs.tf`; expone la URL como output (`api_endpoint`); soporta `var.health_check_path` con default `/`; ejecuta como ingress único de toda la API.

2. **API Gateway resource policy es Allow `*`.** Como se explica en §4.1, la restricción real vive en WAF + Cognito authorizer + IAM lambda permission. La resource policy es explícita en TF (cumple el requisito formal) pero no restringe en la práctica. Si en el futuro se monta CloudFront delante del API, esta policy se actualiza a `Condition: aws:SourceArn matches cloudfront distribution`.

3. **Redeployment manual ocasional después de `terraform apply`.** El recurso `aws_api_gateway_deployment` de TF tiene un bug conocido donde el snapshot a veces se crea antes de que algunos resources nuevos estén listos para incluirse. En esta entrega lo detectamos al agregar `/health` — `curl` devolvía 403 Missing Authentication Token aunque el resource existía. La solución fue `aws apigateway create-deployment --rest-api-id ... --stage-name api` para forzar un redeploy. Si pasa de nuevo, el síntoma es el mismo (route no encontrado por API Gateway aunque exista en la definición) y la solución idem.

## 8. Pipeline CI

Los workflows de GitHub Actions establecidos en D1 y extendidos en D2 (validación con `terraform plan` en PR, apply en merge a main) se mantienen sin cambios funcionales para esta entrega. El plan-on-PR incluye automáticamente los recursos nuevos del módulo `dns` y del `seed.tf` raíz porque consume el mismo `terraform plan -var-file=envs/dev/dev.tfvars` que usamos localmente — no requiere modificación.

Evidencia del run: link al PR + `infra/evidence/ci-plan.png` (screenshot del workflow run).
