# OYD-D4 — Async Infrastructure & Full CD Pipeline

> Resumen de lo entregado en Delivery 4 — Optimizations and Performance · ciclo Mayo–Junio 2026
> **Equipo:** Sebastián Alecio · David García · Joaquín Marroquín
> **Tag de entrega:** `oyd-delivery-4`

---

## 1. Async Messaging Design

### Servicio seleccionado

Para la implementación de procesamiento asíncrono se seleccionó **Amazon SQS Standard**. Esta solución coexiste con el pipeline SNS + SQS + Notifier desarrollado previamente en Cloud Computing Delivery 4, el cual continúa gestionando eventos `ticket.closed` y el envío de notificaciones por correo electrónico.

El nuevo pipeline, implementado en el módulo `async/`, utiliza exclusivamente SQS y es responsable de procesar los eventos `ticket.expired` generados por el watchdog, así como los mensajes enviados mediante el endpoint de pruebas `POST /async/enqueue`.

### Justificación de SQS Standard frente a FIFO

La elección de SQS Standard se fundamenta en las características funcionales y operativas del dominio:

- El volumen esperado de procesamiento es reducido. El watchdog se ejecuta periódicamente y genera lotes pequeños de mensajes, por lo que no es necesario aprovechar las capacidades de throughput garantizado que ofrece FIFO.
- Cada evento `ticket.expired` representa una operación independiente. No existe un requisito de orden de procesamiento entre tickets distintos.
- La idempotencia se encuentra garantizada a nivel de DynamoDB mediante el uso de una `ConditionExpression` que valida que el ticket continúe en estado `Abierto` antes de realizar la actualización correspondiente.
- SQS FIFO introduce un costo mayor por mensaje y limita el throughput global de la cola, sin aportar beneficios relevantes para el caso de uso implementado.

### Configuración de la cola y Dead Letter Queue

La infraestructura se implementó en el módulo `infra/modules/async/` mediante los recursos `aws_sqs_queue.main` y `aws_sqs_queue.dlq`.

| Parámetro                       | Valor               | Justificación                                                                                                                                                                                |
| ------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `max_receive_count`             | `3`                 | Después de tres intentos fallidos de procesamiento, el mensaje es enviado a la DLQ. El valor se mantiene alineado con la configuración utilizada en el pipeline de notificaciones existente. |
| `message_retention_seconds`     | `345600` (4 días)   | Permite conservar mensajes durante interrupciones prolongadas del consumidor.                                                                                                                |
| `dlq_message_retention_seconds` | `1209600` (14 días) | Proporciona una ventana amplia para análisis e investigación posterior a incidentes.                                                                                                         |
| `visibility_timeout_seconds`    | `60` segundos       | Debe ser mayor o igual al timeout del consumidor Lambda (30 segundos) para evitar reentregas prematuras del mismo mensaje.                                                                   |

### Estrategia de manejo de errores

Cuando un mensaje no puede ser procesado correctamente, SQS aplica la política de reintentos configurada mediante `redrive_policy`.

Tras superar el límite definido por `max_receive_count`, el mensaje es trasladado automáticamente a la Dead Letter Queue, donde queda disponible para análisis y recuperación manual.

### Validación con datos reales

La configuración fue validada utilizando datos reales del dominio durante el primer despliegue de la infraestructura.

El watchdog detectó dos tickets vencidos:

- El primer ticket generó exitosamente una notificación hacia la dirección `sebastianalecio@gmail.com`, previamente verificada dentro del entorno sandbox de Amazon SES.
- El segundo ticket estaba asociado a la dirección `oyd-evidence-colab@oyd.local`, la cual no se encontraba verificada. Como consecuencia, SES rechazó el envío en los tres intentos permitidos y el mensaje fue trasladado automáticamente a la DLQ.

Esta prueba permitió verificar el funcionamiento completo de la política de redrive utilizando tráfico real del sistema, incluyendo el manejo de errores y la transferencia automática hacia la cola de mensajes fallidos.

---

## 2. Event-Driven Architecture

### Integración entre SQS y Lambda

El procesamiento de mensajes se realiza mediante el recurso `aws_lambda_event_source_mapping.sqs`, definido en el módulo `infra/modules/compute/`.

La configuración utilizada es la siguiente:

| Parámetro                            | Valor                                | Justificación                                                                                                                                     |
| ------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `batch_size`                         | `1`                                  | Cada invocación procesa un único mensaje, facilitando la trazabilidad, el diagnóstico de errores y el aislamiento de reintentos.                  |
| `maximum_batching_window_in_seconds` | `0`                                  | Los mensajes se entregan inmediatamente después de estar disponibles, priorizando la baja latencia sobre la reducción del número de invocaciones. |
| `bisect_batch_on_function_error`     | Variable declarada pero no utilizada | Se mantiene por compatibilidad de interfaz entre módulos. AWS SQS no soporta este parámetro; únicamente aplica para Kinesis y DynamoDB Streams.   |

La configuración prioriza simplicidad operativa y facilidad de depuración sobre throughput máximo, una decisión adecuada para el volumen actual de mensajes.

### Flujo de reintentos y envío a DLQ

El procesamiento de errores sigue el comportamiento estándar de integración entre SQS y Lambda:

1. El consumidor recibe un mensaje desde la cola principal.
2. Si la ejecución finaliza correctamente, Lambda elimina el mensaje de la cola.
3. Si ocurre una excepción durante el procesamiento, el mensaje permanece en la cola y no se ejecuta `DeleteMessage`.
4. SQS espera el tiempo definido en `visibility_timeout_seconds` (60 segundos).
5. Finalizado dicho período, el mensaje vuelve a estar disponible para una nueva entrega.
6. Cuando el contador de recepciones (`receiveCount`) supera el valor configurado en `max_receive_count`, SQS aplica la política de redrive y mueve el mensaje a la Dead Letter Queue.

La DLQ no dispone de consumidores automáticos. Los mensajes permanecen almacenados para revisión manual por parte del equipo.

### Gestión de mensajes en la DLQ

Los mensajes enviados a la Dead Letter Queue requieren análisis manual antes de cualquier acción correctiva.

El procedimiento esperado consiste en:

1. Revisar el contenido del mensaje almacenado en la DLQ.
2. Identificar la causa raíz del fallo.
3. Determinar si el problema corresponde a:
   - Direcciones de correo no verificadas en Amazon SES.
   - Payloads inválidos o malformados.
   - Datos eliminados o inconsistentes dentro de DynamoDB.
   - Errores de configuración o dependencias externas.
4. Reenviar o descartar el mensaje según corresponda.

No se implementó un mecanismo automático de reprocesamiento, ya que los errores observados suelen estar relacionados con problemas de datos o configuración, y no con fallos transitorios de infraestructura.

### Implementación de Least Privilege

Los permisos asociados al consumidor fueron definidos siguiendo el principio de **least privilege**, restringiendo cada acción únicamente a los recursos estrictamente necesarios.

La política `aws_iam_role_policy.lambda_sqs_consume`, definida en `infra/modules/compute/main.tf`, otorga los siguientes permisos:

| Servicio | Acciones permitidas                                     | Alcance                                                                      |
| -------- | ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| SQS      | `ReceiveMessage`, `DeleteMessage`, `GetQueueAttributes` | ARN exacto de la cola del módulo `async/`.                                   |
| S3       | `PutObject`                                             | Exclusivamente sobre `${bucket_arn}/async-events/*`.                         |
| SES      | `SendEmail`                                             | Restringido mediante la condición `ses:FromAddress = soporte@lumenchat.app`. |

Esta estrategia reduce la superficie de acceso de la función Lambda y evita el uso de permisos amplios o comodines innecesarios.

---

# 3. Terraform Environment Layout and CD Pipeline

## Estructura de entornos

La infraestructura se organizó utilizando una estructura de directorios independiente para cada entorno dentro de `infra/envs/`.

| Archivo | Descripción |
|----------|-------------|
| `infra/envs/dev/dev.tfvars` | Variables específicas del entorno de desarrollo. |
| `infra/envs/dev/backend-dev.hcl` | Configuración del backend S3 para desarrollo. Utiliza la clave `infra/envs/dev/terraform.tfstate`. |
| `infra/envs/staging/staging.tfvars` | Variables específicas del entorno de staging incorporadas en Delivery 4. |
| `infra/envs/staging/backend-staging.hcl` | Configuración del backend S3 para staging. Utiliza la clave `infra/envs/staging/terraform.tfstate`. Comparte el mismo bucket y tabla de locking que el entorno de desarrollo. |

## Estrategia de gestión del estado

Se optó por utilizar archivos `backend-<env>.hcl` independientes para cada entorno en lugar de Terraform Workspaces.

El archivo raíz `backend.tf` se mantiene con una configuración mínima:

``` hcl
backend "s3" {}
```

Durante la ejecución de los workflows, cada entorno inyecta su configuración mediante el parámetro:

`-backend-config=infra/envs/<env>/backend-<env>.hcl`

## Justificación de la estrategia seleccionada

La utilización de archivos de backend independientes proporciona varias ventajas operativas:

- La ubicación del state queda documentada explícitamente en archivos versionados dentro del repositorio.
- La configuración utilizada por cada entorno es visible y auditable sin depender del estado local de Terraform.
- Se elimina el riesgo de ejecutar operaciones sobre un workspace incorrecto por una selección previa inadvertida.
- La omisión del parámetro `-backend-config` genera un error explícito durante la inicialización, reduciendo la probabilidad de errores operativos.

Como parte de esta implementación, el state original fue migrado desde:

`infra/terraform.tfstate`

hacia:

`infra/envs/dev/terraform.tfstate`

mediante la ejecución de:

`terraform init -migrate-state -force-copy`

Se conservó una copia de respaldo del state original en S3 bajo el prefijo `backup-pre-d4`.

## Diferencias entre entornos

Las siguientes variables presentan configuraciones distintas entre los entornos de desarrollo y staging:

| Variable | Dev | Staging | Justificación |
|-----------|-----|----------|---------------|
| `environment` | `dev` | `staging` | Identifica el entorno desplegado. |
| `attachments_bucket_name_prefix` | `pdds-oyd-attachments` | `pdds-oyd-attachments-staging` | Evita colisiones entre recursos S3. |
| `compute_memory_size` | `128` | `256` | Staging dispone de mayor capacidad para pruebas de carga y validaciones de rendimiento. |
| `dns_parent_domain` | `lumenchat.app` | `""` | Staging no utiliza dominios personalizados. |
| `dns_api_full_hostname` | `api.ticke-t.lumenchat.app` | `""` | Disponible únicamente en desarrollo. |
| `dns_enable_api_custom_domain` | `true` | `false` | Deshabilitado en staging para simplificar la configuración DNS. |
| `dns_enable_ses_domain_identity` | `true` | `false` | Evita configuraciones adicionales de DNS y SES en staging. |
| `ses_from_address` | `soporte@lumenchat.app` | `""` | Staging no utiliza una dirección de correo personalizada. |
| `dns_ws_full_hostname` | `ws.ticke-t.lumenchat.app` | `""` | Disponible únicamente en desarrollo. |
| `dns_enable_ws_custom_domain` | `true` | `false` | Deshabilitado en staging. |
| `notifications_max_receive_count` | `3` | `5` | Staging utiliza una política de reintentos más conservadora para pruebas y diagnóstico. |

## Estrategia de promoción mediante Plan Artifacts

Los workflows `terraform-ci.yml` y `terraform-apply.yml` implementan un patrón de promoción basado en artifacts.

Durante la ejecución de una Pull Request:

1. Se ejecuta `terraform plan -out=tfplan`.
2. El archivo de plan generado se publica como artifact mediante `actions/upload-artifact@v4`.
3. También se publica el directorio `modules/compute/build/`, el cual contiene los paquetes ZIP generados por `data.archive_file`.

La publicación de estos artefactos garantiza que el apply utilice exactamente los mismos artefactos evaluados durante el plan.

Durante el merge hacia `main`:

1. El workflow localiza el pipeline de CI asociado a la Pull Request.
2. Descarga los artifacts generados durante el plan.
3. Ejecuta `terraform apply tfplan`.

Este proceso evita la generación de un nuevo plan durante el despliegue y garantiza la consistencia entre la revisión y la aplicación efectiva de cambios.

## Approval Gate para Staging

El entorno `staging` se encuentra protegido mediante GitHub Environments.

La configuración incluye:

- Environment: `staging`
- Required reviewer: `SebastianAlecio`

Cuando el workflow ejecuta el job `apply-staging`, GitHub detiene la ejecución hasta que se complete la aprobación manual correspondiente.

La protección se implementa a nivel de configuración del repositorio y no mediante lógica dentro de los workflows, evitando mecanismos que puedan ser modificados accidentalmente desde el código.

## Gestión de Secrets por Entorno

Cada entorno dispone de su propio conjunto de credenciales:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`

Cuando un workflow declara un entorno específico mediante:

`environment: dev`

GitHub resuelve los secrets definidos para dicho entorno antes de considerar secrets globales del repositorio.

Aunque actualmente ambos entornos utilizan la misma cuenta de AWS, esta estrategia permite migrar staging hacia una cuenta independiente sin requerir cambios en los workflows.

## Protección de la rama principal

Se configuró un Ruleset activo sobre la rama `main` con las siguientes restricciones:

### Status checks requeridos

- `Terraform fmt`
- `Terraform validate`
- `Terraform plan (dev)`

### Reglas de protección

- Requerir Pull Request antes de realizar merges.
- Requerir que las ramas se encuentren actualizadas respecto a `main`.
- Bloquear force pushes.
- Restringir la eliminación de la rama.

## Justificación de las protecciones configuradas

La combinación de las reglas *Require branches to be up to date before merging* y *Block force pushes* evita escenarios donde código no validado termine incorporándose a la rama principal.

Exigir que las ramas estén actualizadas garantiza que las validaciones se ejecuten sobre la versión más reciente de `main`, reduciendo el riesgo de conflictos entre cambios paralelos.

Por otra parte, bloquear force pushes protege la integridad del historial de revisiones y evita que cambios previamente aprobados puedan ser sobrescritos o eliminados.

---

# 4. Scheduled Jobs

## Función programada

La automatización periódica del dominio se implementó mediante la función Lambda:

`pdds-oyd-watchdog-dev`

El código fuente se encuentra ubicado en:

`infra/modules/compute/src/watchdog/index.js`

## Comportamiento

La función consulta periódicamente la tabla `aws_dynamodb_table.tickets-dev` utilizando el índice GSI4 (`STATUS#Abierto`).

Durante cada ejecución:

1. Se identifican tickets cuya fecha límite haya expirado (`fecha_limite <= now`).
2. Se actualiza su estado a `Vencido`.
3. La actualización se realiza utilizando una `ConditionExpression` que garantiza que el ticket continúe en estado `Abierto`.
4. Se publica un evento `ticket.expired` en la cola SQS del módulo `async/`.
5. El consumidor asíncrono procesa posteriormente el evento, generando un registro de auditoría en S3 y enviando una notificación mediante Amazon SES.

## Configuración del Scheduler

| Parámetro | Valor |
|------------|--------|
| Schedule Expression | `rate(5 minutes)` |
| Variable Terraform | `watchdog_schedule` |
| Timezone | `America/Guatemala` |

## Justificación del intervalo de ejecución

Se seleccionó una frecuencia de ejecución de cinco minutos para mejorar la capacidad de respuesta del sistema ante vencimientos de SLA.

Esta configuración ofrece las siguientes ventajas:

- Reduce significativamente el tiempo máximo que un ticket puede permanecer en estado `Abierto` después de haber vencido.
- Garantiza que un ticket sea detectado y actualizado en un plazo máximo aproximado de cinco minutos.
- Permite generar notificaciones cercanas al momento real del vencimiento.
- Mantiene una carga reducida sobre DynamoDB, Lambda y SQS debido al bajo volumen esperado de tickets.
- Representa un equilibrio adecuado entre rapidez de reacción y eficiencia operativa, evitando intervalos excesivamente agresivos que generarían ejecuciones innecesarias.

## Gestión de zona horaria

La variable `watchdog_timezone` utiliza el valor:

`America/Guatemala`

Aunque las expresiones basadas en `rate()` no dependen de zonas horarias, esta configuración se mantiene para soportar futuras expresiones basadas en horarios específicos, por ejemplo:

`cron(0 8 * * ? *)`

que permitirían ejecutar tareas programadas a las 08:00 horas de Guatemala.

## Implementación mediante EventBridge Scheduler

La programación se implementó mediante el recurso:

`aws_scheduler_schedule.this`

definido en `infra/modules/compute/main.tf`.

Se seleccionó EventBridge Scheduler en lugar del recurso legacy `aws_cloudwatch_event_rule` debido a las siguientes capacidades adicionales:

- Soporte nativo para zonas horarias IANA.
- Programaciones únicas (one-off schedules).
- Roles IAM dedicados por schedule.
- Mejor alineación con el principio de least privilege.

## IAM Role del Scheduler

La invocación de la función watchdog se realiza mediante el rol:

`aws_iam_role.scheduler_invoke`

### Trust Policy

Únicamente el servicio:

`scheduler.amazonaws.com`

puede asumir este rol.

### Permisos otorgados

| Acción | Recurso |
|----------|----------|
| `lambda:InvokeFunction` | ARN exacto de `aws_lambda_function.this` |

La política evita el uso de comodines y restringe la capacidad de invocación exclusivamente a la función watchdog.

## Separación de responsabilidades

El rol utilizado por EventBridge Scheduler posee permisos significativamente más limitados que el execution role de la función Lambda.

Mientras el scheduler únicamente requiere invocar una función específica, la Lambda necesita permisos para:

- Consultar y actualizar DynamoDB.
- Publicar mensajes en SQS.
- Generar logs en CloudWatch.

La separación de responsabilidades permite aplicar de forma efectiva el principio de least privilege y reducir la superficie de acceso de cada componente de la arquitectura.

---

# 5. End-to-End Async Proof

## Lenguaje y Runtime

La solución fue implementada utilizando **JavaScript sobre Node.js 22 (arm64)**, manteniendo consistencia con el resto de las funciones Lambda del proyecto, incluyendo los componentes de tickets, chat WebSocket y notificaciones.

## Flujo End-to-End

La validación del procesamiento asíncrono se realizó verificando el flujo completo desde la generación del mensaje hasta su persistencia y notificación.

### Productor Principal: Endpoint HTTP

El punto de entrada principal corresponde al endpoint:

`POST /async/enqueue`

expuesto mediante API Gateway REST y protegido mediante el mismo Cognito Authorizer utilizado por el resto de la API.

La lógica se implementa en la Lambda de tickets mediante el handler:

`handleAsyncEnqueue`

ubicado en:

`infra/modules/compute/src/index.js`

### Publicación del mensaje

Cuando la solicitud es recibida:

1. La Lambda procesa el cuerpo de la petición en formato JSON.
2. Utiliza `SQSClient.send(SendMessageCommand)` para publicar el mensaje en la cola configurada mediante la variable de entorno `ASYNC_QUEUE_URL`.
3. AWS SQS genera un `MessageId` único para la solicitud.
4. La API responde con código HTTP `202 Accepted`, incluyendo el `MessageId` real devuelto por AWS.

### Activación del consumidor

La cola se encuentra conectada a la función consumidora mediante el recurso:

`aws_lambda_event_source_mapping`

configurado con el ARN de la cola como origen de eventos.

La integración utiliza long polling y procesa un único mensaje por invocación (`batch_size = 1`), favoreciendo la trazabilidad y el aislamiento de errores.

### Procesamiento del mensaje

El consumidor se implementa mediante la función:

`async-consumer`

cuyo código fuente se encuentra en:

`infra/modules/compute/src/async-consumer/index.js`

Para cada mensaje recibido, el proceso ejecuta las siguientes acciones:

1. Deserializa el payload JSON.
2. Genera un objeto de auditoría con información del evento y metadatos de procesamiento.
3. Almacena el resultado en Amazon S3.
4. Registra información de trazabilidad en CloudWatch Logs.
5. Ejecuta acciones adicionales dependiendo del tipo de evento recibido.

### Persistencia en Amazon S3

Cada mensaje procesado genera un objeto dentro del bucket de adjuntos utilizando el siguiente patrón:

```text
s3://pdds-oyd-attachments-dev-<sufijo>/async-events/<messageId>.json
```

El archivo almacena:

- Payload original.
- Metadatos de procesamiento.
- Información necesaria para auditoría y trazabilidad.

### Registro de eventos

Después de completar el procesamiento, la función registra un evento `async_consumer_ok` en CloudWatch Logs.

El registro incluye:

- `messageId`
- `bucket`
- `objectKey`

Esta información permite correlacionar fácilmente:

- El mensaje original en SQS.
- La ejecución de Lambda.
- El objeto persistido en S3.

### Procesamiento de eventos de vencimiento

Cuando el payload contiene:

```json
{
  "event": "ticket.expired"
}
```

el consumidor ejecuta una acción adicional de notificación mediante Amazon SES.

El correo se envía al solicitante asociado al ticket utilizando la información incluida en el mensaje.

### Productor Secundario: Watchdog

Además del endpoint HTTP, la arquitectura dispone de un segundo productor de mensajes.

La función watchdog publica directamente eventos con la siguiente estructura:

```json
{
  "event": "ticket.expired"
}
```

en la cola asíncrona.

A partir de ese punto, el procesamiento continúa exactamente por el mismo flujo descrito anteriormente, reutilizando la misma infraestructura de consumo, auditoría y notificación.

## Permisos del Consumidor

Los permisos asociados al execution role del consumidor fueron definidos siguiendo el principio de least privilege.

| Servicio | Acciones permitidas | Alcance |
|-----------|--------------------|----------|
| S3 | `PutObject` | `arn:aws:s3:::pdds-oyd-attachments-dev-<sufijo>/async-events/*` |
| SQS | `ReceiveMessage`, `DeleteMessage`, `GetQueueAttributes` | ARN exacto de la cola asíncrona |
| SES | `SendEmail`, `SendRawEmail` | Restringido a `soporte@lumenchat.app` mediante condición IAM |
| CloudWatch Logs | `CreateLogStream`, `PutLogEvents` | Log group propio del consumidor |

La restricción aplicada a SES garantiza que la función únicamente pueda enviar correos desde la dirección autorizada. Cualquier intento de utilizar una dirección diferente será rechazado por el servicio.

## Estrategia de generación de Object Keys

Los objetos almacenados en S3 utilizan el siguiente patrón:

```text
async-events/<messageId>.json
```

El identificador es generado directamente por Amazon SQS durante la operación `SendMessage`.

Debido a que cada `MessageId` es único dentro del servicio, la estrategia garantiza unicidad natural de las claves y elimina el riesgo de colisiones incluso cuando múltiples productores publican mensajes concurrentemente.

---

# 6. Trade-offs Arquitectónicos

## SQS Standard vs SQS FIFO

Para la implementación del módulo `async/` se seleccionó Amazon SQS Standard.

La siguiente tabla resume las principales diferencias evaluadas durante el diseño:

| Característica | SQS Standard | SQS FIFO |
|----------------|--------------|----------|
| Throughput | Muy alto | Limitado |
| Orden de mensajes | No garantizado | Garantizado por grupo |
| Entrega | At-least-once | Exactly-once dentro de la ventana de deduplicación |
| Complejidad operativa | Baja | Mayor |
| Costo aproximado | Menor | Mayor |

### Justificación de la decisión

El volumen esperado para eventos `ticket.expired` es reducido y los mensajes representan operaciones independientes.

No existe un requisito funcional que obligue a procesar tickets en un orden específico, y la idempotencia ya se encuentra garantizada mediante validaciones sobre DynamoDB antes de actualizar el estado del ticket.

La utilización de FIFO habría introducido complejidad adicional mediante el manejo de:

- `MessageGroupId`
- `MessageDeduplicationId`

sin aportar beneficios significativos para el dominio implementado.

Por este motivo, SQS Standard representa la alternativa más simple, económica y adecuada para el escenario actual.

## Backend Configurations vs Terraform Workspaces

Para la gestión de entornos se seleccionó una estrategia basada en archivos `backend-<env>.hcl` independientes en lugar de Terraform Workspaces.

### Comparación de alternativas

| Aspecto | Backend independiente | Terraform Workspaces |
|----------|----------------------|----------------------|
| Configuración visible en el repositorio | Sí | No |
| Dependencia del estado local | No | Sí |
| Riesgo de operar sobre el entorno incorrecto | Bajo | Moderado |
| Complejidad operativa | Baja | Baja |
| Cantidad de archivos | Mayor | Menor |

### Justificación de la decisión

La principal ventaja de la estrategia seleccionada es que la configuración de cada entorno queda completamente documentada dentro del repositorio.

Cada backend especifica explícitamente:

- Bucket de estado.
- Key del state.
- Tabla de locking.

Por el contrario, Terraform Workspaces depende del workspace activo almacenado localmente dentro del directorio `.terraform`.

Esto introduce el riesgo de ejecutar operaciones sobre un entorno incorrecto debido a una selección previa inadvertida del workspace.

Aunque Terraform Workspaces reduce la cantidad de archivos de configuración, la estrategia basada en backends independientes ofrece mayor visibilidad, auditabilidad y seguridad operativa para un equipo pequeño que comparte responsabilidades sobre la infraestructura.

---

# Evidence

## Evidencia recopilada

Toda la evidencia utilizada para validar la implementación se encuentra almacenada en el directorio:

`infra/evidence/`

Los artefactos también se encuentran referenciados desde la sección **Evidence** del archivo `infra/README.md`.

| Archivo | Evidencia documentada |
|----------|----------------------|
| `async-foundation.txt` | Salida de Terraform con URL y ARN de la cola principal y la DLQ. |
| `event-source-plan.txt` | Resultado del comando `aws lambda get-event-source-mapping`. |
| `event-source.png` | Configuración del trigger del consumidor en la consola de Lambda. |
| `scheduler-plan.txt` | Resultado del comando `aws scheduler get-schedule`. |
| `scheduler.png` | Configuración del schedule en EventBridge Scheduler. |
| `scheduler-target.png` | Configuración del target y rol IAM asociado al scheduler. |
| `async-enqueue.txt` | Ejecución de `POST /async/enqueue` mostrando HTTP 202 y MessageId. |
| `async-consumer.png` | Registro `async_consumer_ok` generado por CloudWatch Logs. |
| `async-object.png` | Objeto generado en S3 bajo el prefijo `async-events/`. |
| `github-environments.png` | Configuración de los entornos GitHub `dev` y `staging`. |
| `github-environments-staging.png` | Configuración del approval gate para staging. |
| `ruleset-config.png` | Ruleset aplicado sobre la rama principal. |
| `ruleset-config-checks.png` | Status checks obligatorios configurados para el repositorio. |
| `ruleset-blocked-merge.png` | Pull Request bloqueada por incumplimiento de validaciones. |
| `ci-apply-dev.png` | Ejecución exitosa del despliegue en desarrollo. |
| `ci-apply-staging.png` | Despliegue de staging detenido en espera de aprobación. |
| `ci-destroy.png` | Workflow de destrucción protegido mediante aprobación manual. |
| `ci-drift.png` | Evidencia de detección de drift y publicación del resultado en `GITHUB_STEP_SUMMARY`. |
