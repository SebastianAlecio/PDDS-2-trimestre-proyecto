# Delivery 5 — Security, Observability & One-Click Deployment

**Tag:** `oyd-delivery-5`
**Course:** Optimizations and Performance (PDDS, Galileo)
**Team:** SebastianAlecio / dacaslles / nydiamonica2002

## 1. IAM y Gestión de Secretos

### Diseño de Roles IAM

Se implementó una estrategia de control de acceso basada en el principio de **least privilege**, centralizando la definición de roles dentro del módulo `infra/modules/iam/`.

Previo al Delivery 5, los permisos IAM se encontraban definidos de forma embebida en `modules/compute/`, utilizando un único rol compartido para las cinco funciones Lambda y un rol adicional para el scheduler. Como resultado del refactor, cada servicio dispone de un rol independiente con políticas específicas y permisos limitados a los recursos estrictamente necesarios.

La solución elimina el uso de comodines (`*`) tanto en acciones como en recursos, aplicando alcance explícito mediante ARNs específicos.

### Roles Implementados

| Rol | Principal de confianza | Permisos principales | Alcance de recursos |
|------|------|------|------|
| `pdds-oyd-tickets-lambda-dev` | `lambda.amazonaws.com` | Logs, operaciones CRUD sobre DynamoDB, lectura/escritura de adjuntos en S3, operaciones administrativas de Cognito, `sns:Publish`, `sqs:SendMessage`, `execute-api:ManageConnections` | Log Group de Tickets Lambda, tabla DynamoDB y `/index/*`, `attachments_bucket/attachments/*`, User Pool de Cognito, tópico SNS, cola asíncrona SQS y `ws_api/*/POST/@connections/*` |
| `pdds-oyd-chat-ws-lambda-dev` | `lambda.amazonaws.com` | Logs, operaciones CRUD sobre DynamoDB, lectura/escritura de adjuntos en S3, `execute-api:ManageConnections` | Mismo alcance de DynamoDB y S3 utilizado por Tickets Lambda, además de su Log Group dedicado |
| `pdds-oyd-notifier-lambda-dev` | `lambda.amazonaws.com` | Logs, consumo de mensajes desde Notifications Queue, operaciones `GetItem` y `PutItem` para idempotencia en DynamoDB, `ses:SendEmail` | `notifications_sqs_queue`, tabla DynamoDB y ARN de identidad SES `arn:aws:ses:us-east-1:544341949288:identity/lumenchat.app`, restringido mediante condición `ses:FromAddress` |
| `pdds-oyd-async-consumer-lambda-dev` | `lambda.amazonaws.com` | Logs, consumo de mensajes desde Async Queue, `s3:PutObject` sobre eventos asíncronos, `ses:SendEmail` | `async_sqs_queue`, `attachments_bucket/async-events/*` y mismo alcance SES utilizado por el Notifier |
| `pdds-oyd-watchdog-lambda-dev` | `lambda.amazonaws.com` | Logs, consultas sobre `GSI4`, actualizaciones en DynamoDB y envío de mensajes a SQS | Tabla DynamoDB, índice `/index/GSI4` y `async_sqs_queue` |
| `pdds-oyd-scheduler-invoke-dev` | `scheduler.amazonaws.com` | `lambda:InvokeFunction` | ARN específico de la función Lambda Watchdog |
| `pdds-oyd-ci-runner-dev` | `Federated` (OIDC GitHub) | `AdministratorAccess` (Managed Policy) | Todos los recursos (`*`) |

### Política SES

La política asociada a Amazon SES fue endurecida respecto a la implementación inicial.

**Configuración anterior:**

```text
Resource = "*"
Condition:
  StringEquals:
    ses:FromAddress
```

**Configuración actual:**

```text
Resource = arn:aws:ses:us-east-1:544341949288:identity/lumenchat.app
Condition:
  StringEquals:
    ses:FromAddress
```

La condición `ses:FromAddress` se mantiene como mecanismo adicional de defensa en profundidad, mientras que el recurso queda restringido a la identidad SES específica. Esta configuración elimina completamente el uso de comodines en la política.

### Justificación del Rol `ci_runner`

El rol `pdds-oyd-ci-runner-dev` utiliza la política administrada `AdministratorAccess`.

#### Alternativas evaluadas

| Alternativa | Ventajas | Desventajas |
|------------|----------|-------------|
| Política IAM personalizada mínima | Menor superficie de permisos | Elevada complejidad de mantenimiento y actualización |
| `PowerUserAccess` + `IAMFullAccess` | Patrón común para Terraform | Continúa requiriendo validación y mantenimiento de permisos complementarios |
| `AdministratorAccess` | Cobertura completa para Terraform y menor complejidad operativa | Mayor alcance de permisos |

#### Decisión adoptada

Se seleccionó `AdministratorAccess` debido a que Terraform administra recursos de infraestructura con amplias dependencias, incluyendo:

- Roles y políticas IAM.
- Políticas de claves KMS.
- Proveedores OIDC.
- Zonas de Route 53.
- Distribuciones CloudFront.
- Políticas de buckets S3.

La construcción y mantenimiento de una política personalizada equivalente implicaría varios cientos de líneas de definición IAM y una elevada fragilidad ante cambios del proveedor de Terraform o incorporación de nuevos servicios.

Como mecanismo compensatorio, el acceso queda restringido mediante la política de confianza OIDC asociada exclusivamente al repositorio autorizado. Las credenciales nunca son almacenadas como secretos persistentes, sino obtenidas dinámicamente mediante federación.

## Gestión de Secretos

### Decisión Arquitectónica

La aplicación Ticke-T no utiliza AWS Secrets Manager.

La arquitectura implementada es completamente serverless y no requiere credenciales persistentes para los componentes principales.

### Justificación

| Componente | Mecanismo de autenticación | Requiere secreto almacenado |
|------------|---------------------------|-----------------------------|
| DynamoDB | IAM Authentication | No |
| Cognito | Gestión nativa de credenciales y claves JWT | No |
| Comunicación entre Lambdas | IAM + SQS + SNS | No |

La persistencia de datos se realiza mediante DynamoDB, eliminando la necesidad de contraseñas de conexión. Asimismo, Cognito administra internamente las credenciales de usuario y las claves de firma de tokens JWT, evitando su gestión dentro de la aplicación.

La comunicación entre funciones Lambda se realiza mediante SQS y SNS, utilizando autorización basada en IAM en lugar de secretos compartidos.

### Consideraciones Futuras

Dado que actualmente no existen credenciales persistentes que requieran protección, no se incorporó un secreto artificial en Secrets Manager únicamente para justificar su utilización.

La protección de la información en reposo se encuentra cubierta mediante la clave CMK descrita en la sección de KMS.

En caso de incorporar componentes que requieran credenciales almacenadas —por ejemplo, integraciones con servicios externos basados en API Keys— la estructura del módulo `iam/` ya se encuentra preparada para incorporar:

- `aws_secretsmanager_secret`
- Permisos `secretsmanager:GetSecretValue`
- Asignación selectiva de acceso a los roles consumidores correspondientes

---

## 2. Gestión de Claves KMS

### Configuración General

Se implementó una única clave KMS administrada por el cliente (Customer Managed Key - CMK) para la protección de los almacenes de datos del proyecto.

| Propiedad | Valor |
|------------|--------|
| Alias | `alias/pdds-oyd-dev` |
| Key ARN | `arn:aws:kms:us-east-1:544341949288:key/f0e632bd-24e5-41a4-abdd-75b15bb069f9` |
| Key Manager | `CUSTOMER` |
| Rotación automática | Habilitada (anual) |
| Ventana de eliminación | 7 días |

### Recursos Protegidos

| Recurso | Configuración |
|----------|--------------|
| `pdds-oyd-attachments-dev-b16b7b45` | Migración de SSE-S3 a `aws:kms`, con `bucket_key_enabled = true` para reducir el costo de operaciones KMS hasta en un 99% |
| `tickets-dev` | Cifrado SSE mediante KMS utilizando la CMK definida (`SSEType = KMS`) |

### Política de la Clave

La política de la CMK se compone de tres declaraciones principales, todas restringidas mediante condiciones específicas.

#### 1. Administración por la Cuenta Propietaria

Permite operaciones `kms:*` al principal root de la cuenta con la condición:

```text
StringEquals:
  kms:CallerAccount = 544341949288
```

Este patrón es compatible con la gestión de recursos mediante Terraform y restringe el uso de la clave a solicitudes originadas dentro de la cuenta propietaria.

#### 2. Acceso para Servicios AWS

Se otorgaron permisos a los servicios:

- `s3.amazonaws.com`
- `dynamodb.amazonaws.com`

Permisos habilitados:

- Encrypt
- Decrypt
- GenerateDataKey
- Operaciones complementarias requeridas por KMS

Condición aplicada:

```text
StringEquals:
  kms:ViaService:
    - s3.us-east-1.amazonaws.com
    - dynamodb.us-east-1.amazonaws.com
```

Esta restricción impide el uso de la clave fuera de los servicios autorizados.

#### 3. Acceso para Funciones Lambda

Se otorgaron permisos a los cinco roles de ejecución Lambda.

Permisos habilitados:

- `kms:Decrypt`
- `kms:GenerateDataKey`
- `kms:DescribeKey`

Condición aplicada:

```text
StringEquals:
  kms:ViaService:
    - s3.us-east-1.amazonaws.com
    - dynamodb.us-east-1.amazonaws.com
```

Esta configuración permite el acceso únicamente a través de DynamoDB y S3, evitando operaciones directas de descifrado sobre cargas arbitrarias.

### Aplicación del Principio de Least Privilege

| Tipo de acceso | Restricción aplicada |
|----------------|---------------------|
| Servicios AWS | Limitados mediante `kms:ViaService` |
| Roles Lambda | Acceso únicamente a operaciones mínimas requeridas |
| Recursos cifrados | DynamoDB y bucket de adjuntos |
| Descifrado directo | No permitido |
| Uso fuera de la cuenta propietaria | Restringido mediante `kms:CallerAccount` |

### Exclusión de KMS en el Bucket Frontend

El bucket de distribución frontend `pdds-oyd-frontend-dev-*` utiliza cifrado SSE-S3 en lugar de KMS.

#### Justificación

Los objetos almacenados corresponden a archivos estáticos públicos distribuidos mediante CloudFront y no contienen información sensible que requiera protección adicional mediante claves administradas por el cliente.

La incorporación de KMS en este escenario incrementaría el costo operativo sin aportar beneficios significativos en términos de seguridad o cumplimiento para este tipo de contenido.

---

## 3. Federación OIDC

### Proveedor OpenID Connect

Se implementó autenticación federada entre GitHub Actions y AWS mediante un proveedor OpenID Connect (OIDC) administrado por Terraform a través del recurso `aws_iam_openid_connect_provider.github`.

| Propiedad | Valor |
|------------|--------|
| URL | `https://token.actions.githubusercontent.com` |
| Audience | `sts.amazonaws.com` |
| Thumbprints | Thumbprints oficiales publicados por AWS para permitir rotación segura de certificados |
| ARN | `arn:aws:iam::544341949288:oidc-provider/token.actions.githubusercontent.com` |

La implementación elimina la necesidad de credenciales AWS persistentes en GitHub y permite la obtención dinámica de credenciales temporales mediante `AssumeRoleWithWebIdentity`.

### Política de Confianza del Rol `ci_runner`

El rol `pdds-oyd-ci-runner-dev` restringe explícitamente el acceso al repositorio:

```text
SebastianAlecio/PDDS-2-trimestre-proyecto
```

La política de confianza acepta únicamente cuatro valores específicos para el claim `sub`, configurados mediante `StringLike` sin utilizar comodines.

#### Subject Claims Permitidos

```text
repo:SebastianAlecio/PDDS-2-trimestre-proyecto:ref:refs/heads/main
repo:SebastianAlecio/PDDS-2-trimestre-proyecto:pull_request
repo:SebastianAlecio/PDDS-2-trimestre-proyecto:environment:dev
repo:SebastianAlecio/PDDS-2-trimestre-proyecto:environment:staging
```

### Justificación de los Subject Claims

La configuración responde a los distintos mecanismos de ejecución definidos en los pipelines de GitHub Actions.

| Subject Claim | Trigger asociado |
|---------------|------------------|
| `ref:refs/heads/main` | Despliegues por push directo a `main` y ejecución programada de detección de drift |
| `pull_request` | Ejecución de Terraform Plan para Pull Requests |
| `environment:dev` | Ejecuciones manuales (`workflow_dispatch`) sobre el entorno de desarrollo |
| `environment:staging` | Ejecuciones manuales (`workflow_dispatch`) sobre el entorno de staging |

Esta estrategia garantiza que:

- El rol únicamente pueda ser asumido por workflows pertenecientes al repositorio autorizado.
- Cada tipo de ejecución cuente con un subject claim específico.
- No se utilicen comodines (`*`) en la política de confianza.
- Se impida el acceso desde otros repositorios o entornos no autorizados.

### Migración de Workflows

Se migraron los siguientes workflows para utilizar autenticación federada mediante OIDC:

| Workflow |
|-----------|
| `terraform-ci.yml` |
| `terraform-apply.yml` |
| `terraform-destroy.yml` |
| `terraform-drift.yml` |
| `frontend-deploy.yml` |

Todos los workflows incorporan la siguiente configuración:

```yaml
permissions:
  id-token: write
```

Asimismo, se sustituyó el uso de credenciales estáticas:

```yaml
aws-access-key-id
aws-secret-access-key
```

por la asunción dinámica del rol IAM correspondiente:

```yaml
role-to-assume: ${{ vars.AWS_ROLE_ARN_DEV }}
```

o

```yaml
role-to-assume: ${{ vars.AWS_ROLE_ARN_STAGING }}
```

### Eliminación de Credenciales Persistentes

Una vez validado el funcionamiento de la autenticación federada, se eliminaron manualmente los secretos AWS previamente almacenados en GitHub.

| Secret eliminado |
|------------------|
| `AWS_ACCESS_KEY_ID` |
| `AWS_SECRET_ACCESS_KEY` |

**Evidencia:**

```text
infra/evidence/oidc-secrets-removed.png
```

### Beneficios de la Solución

La adopción de OIDC proporciona las siguientes ventajas:

- Eliminación de credenciales AWS de larga duración.
- Obtención de credenciales temporales bajo demanda.
- Reducción de la superficie de exposición de secretos.
- Control granular mediante políticas de confianza basadas en claims.
- Integración nativa con GitHub Actions y AWS STS.

---

## 4. Diseño de Observabilidad

La solución incorpora un módulo dedicado de observabilidad ubicado en:

```text
infra/modules/observability/
```

La estrategia de monitoreo se compone de tres elementos principales:

1. Alarmas de CloudWatch.
2. Dashboard centralizado.
3. Monitoreo de costos mediante AWS Budgets.

---

## Alarmas CloudWatch

Se definieron ocho alarmas para supervisar errores de ejecución, acumulación de mensajes en colas y disponibilidad de la API.

### Alarmas Configuradas

| Alarma | Umbral | Período | Justificación |
|----------|----------|----------|---------------|
| `pdds-oyd-dev-chat-message-handler-dev-errors` | > 5 errores | 5 minutos | Más de un error por minuto durante cinco minutos consecutivos indica una falla recurrente en el handler. El umbral evita alertas por errores aislados o transitorios. |
| `pdds-oyd-dev-chat-ws-dev-errors` | > 5 errores | 5 minutos | Mismo criterio aplicado a la función WebSocket. |
| `pdds-oyd-dev-ticket-notifier-dev-errors` | > 5 errores | 5 minutos | Mismo criterio aplicado al servicio de notificaciones. |
| `pdds-oyd-dev-pdds-oyd-async-consumer-dev-errors` | > 5 errores | 5 minutos | Mismo criterio aplicado al consumidor asíncrono. |
| `pdds-oyd-dev-pdds-oyd-watchdog-dev-errors` | > 5 errores | 5 minutos | Alcanzar cinco errores en cinco minutos implica múltiples ejecuciones consecutivas fallidas y constituye un escenario crítico. |
| `pdds-oyd-dev-ticke-t-async-dev-dlq-dlq-depth` | > 0 mensajes | 1 minuto | La presencia de cualquier mensaje en la DLQ indica un fallo de procesamiento. |
| `pdds-oyd-dev-ticket-notifications-dev-dlq-dlq-depth` | > 0 mensajes | 1 minuto | Mismo criterio aplicado a la DLQ de notificaciones. |
| `pdds-oyd-dev-api-5xx` | > 10 errores | 5 minutos | Más de dos errores 5XX por minuto de forma sostenida indica un problema activo en la integración o en las funciones Lambda asociadas. |

### Notificaciones

Todas las alarmas se encuentran asociadas al tópico SNS:

```text
arn:aws:sns:us-east-1:544341949288:pdds-oyd-dev-alarms
```

Las notificaciones se distribuyen mediante suscripción por correo electrónico a:

```text
sebastianalecio@gmail.com
```

---

## Dashboard Operacional

Se implementó un dashboard centralizado mediante el recurso:

```text
aws_cloudwatch_dashboard.main
```

Nombre configurado:

```text
pdds-oyd-dev-main
```

### Diseño del Dashboard

El contenido se genera utilizando `jsonencode()` y referencias a variables Terraform.

Esta aproximación evita:

- ARNs codificados manualmente.
- Duplicación de nombres de recursos.
- Modificaciones manuales entre entornos.

Los nombres de funciones Lambda, colas SQS y demás recursos son resueltos automáticamente a partir de la configuración del entorno.

### Widgets Implementados

| Widget | Métricas monitoreadas | Objetivo |
|----------|----------------------|-----------|
| API Gateway Request Volume + Errors | `AWS/ApiGateway` → `Count`, `4XXError`, `5XXError` | Proporcionar una vista general de la salud del punto de ingreso de la aplicación. |
| Lambda Errors por Función | `AWS/Lambda` → `Errors` para las cinco funciones Lambda | Identificar rápidamente qué función presenta errores sin necesidad de inspeccionar individualmente los Log Groups. |
| SQS Depth (Main + DLQ) | `AWS/SQS` → `ApproximateNumberOfMessagesVisible` sobre las cuatro colas (principales y DLQ) | Detectar acumulación de mensajes, cuellos de botella y mensajes fallidos. |

---

## Monitoreo de Costos

Se implementó un presupuesto mensual mediante el recurso:

```text
aws_budgets_budget.monthly
```

### Configuración

| Propiedad | Valor |
|------------|--------|
| Presupuesto mensual | 20 USD |
| Umbral de notificación | 80% |
| Monto de alerta | 16 USD |
| Canal de notificación | SNS + correo electrónico |

### Justificación del Presupuesto

El valor de 20 USD mensuales fue definido a partir del análisis del costo operativo observado después del Delivery 4.

#### Situación Actual

- Costo recurrente estimado inferior a 1 USD por mes.
- Lambda cubierto principalmente por Free Tier.
- DynamoDB On-Demand con utilización reducida.
- Almacenamiento S3 inferior a 1 GB.

#### Decisión Adoptada

El presupuesto de 20 USD proporciona suficiente margen para:

- Incrementos temporales de uso durante demostraciones.
- Ejecuciones adicionales durante procesos de evaluación o calificación.
- Pruebas operativas controladas.

Al mismo tiempo, el umbral de alerta permite detectar oportunamente escenarios anómalos de consumo, como:

- Funciones Lambda ejecutándose de forma descontrolada.
- Ciclos infinitos de procesamiento.
- Incrementos inesperados en tráfico o almacenamiento.

Esta configuración equilibra la reducción de falsos positivos con la capacidad de detectar desviaciones significativas de costos antes de que se conviertan en un impacto económico relevante.

--

## 5. Architectural trade-offs

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

