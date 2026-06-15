module "compute" {
  source = "./modules/compute"

  environment = var.environment
  name        = var.compute_function_name
  memory_size = var.compute_memory_size

  attach_dynamodb_policy = true
  dynamodb_table_arn     = module.database.table_arn

  attach_attachments_bucket_policy = true
  attachments_bucket_arn           = module.storage.bucket_arn

  attach_cognito_policy = true
  cognito_user_pool_arn = module.security.user_pool_arn

  # SNS publish para eventos del dominio tickets (ticket.closed). El topic se
  # crea en el módulo notifications; la Lambda lo consume vía env var.
  attach_sns_publish_policy = true
  sns_topic_arn             = module.notifications.sns_topic_arn

  # WebSocket Management: la tickets Lambda necesita PostToConnection para
  # hacer broadcast del evento ticket.closed a todas las conexiones del
  # ticket (colaborador con widget abierto + agente con panel abierto).
  attach_websocket_management_policy = true
  websocket_api_execution_arn        = module.realtime.api_execution_arn

  # SQS SendMessage: producer del endpoint POST /async/enqueue (OYD-D4
  # Deliverable E). Scoped al ARN exacto de la cola async, no wildcard.
  attach_sqs_send_policy = true
  sqs_send_queue_arn     = module.async.queue_arn

  environment_variables = {
    TICKETS_TABLE_NAME      = module.database.table_name
    ATTACHMENTS_BUCKET_NAME = module.storage.bucket_name
    COGNITO_USER_POOL_ID    = module.security.user_pool_id
    HEALTH_CHECK_PATH       = var.api_health_check_path
    SNS_TOPIC_ARN           = module.notifications.sns_topic_arn
    WEBSOCKET_API_ENDPOINT  = module.realtime.management_endpoint
    ASYNC_QUEUE_URL         = module.async.queue_url
  }
}

# Async consumer Lambda — consumer del flow Deliverable E del rubric
# OYD-D4. Recibe records vía aws_lambda_event_source_mapping desde la
# cola del módulo async/. Por cada mensaje escribe UN objeto a S3 bajo el
# prefix async-events/<message_id>.json y loggea el messageId.
module "async_consumer" {
  source = "./modules/compute"

  environment     = var.environment
  name            = "${var.project_name}-async-consumer"
  source_dir      = "${path.module}/modules/compute/src/async-consumer"
  timeout_seconds = 30
  memory_size     = 128

  # SQS consume: event source mapping + IAM (sqs:Receive/Delete/GetQueue
  # scoped al queue ARN exacto, no wildcard).
  attach_sqs_consume_policy          = true
  sqs_queue_arn                      = module.async.queue_arn
  sqs_batch_size                     = 1
  maximum_batching_window_in_seconds = 0
  bisect_batch_on_function_error     = true

  # S3 PutObject scoped al prefix async-events/* del bucket de attachments
  # (reusamos el bucket de D2 sin duplicar resources — la separación es
  # por prefix, no por bucket).
  attach_async_bucket_policy = true
  async_bucket_arn           = module.storage.bucket_arn
  async_bucket_key_prefix    = "async-events/"

  environment_variables = {
    ASYNC_BUCKET_NAME       = module.storage.bucket_name
    ASYNC_BUCKET_KEY_PREFIX = "async-events/"
  }
}

# Notifier Lambda: consumer de la cola SQS que recibe los eventos publicados
# al SNS topic. Por cada mensaje, manda un email vía SES a solicitante.correo.
# Es una segunda instancia del módulo compute con source_dir distinto y
# perms IAM distintos (SQS consume + SES send en vez de DDB + S3).
module "notifier" {
  source = "./modules/compute"

  environment     = var.environment
  name            = "ticket-notifier"
  source_dir      = "${path.module}/modules/compute/src/notifier"
  timeout_seconds = 15

  attach_sqs_consume_policy = true
  sqs_queue_arn             = module.notifications.sqs_queue_arn

  attach_ses_send_policy = true
  ses_from_address       = var.ses_from_address

  # Acceso a DynamoDB para registros de idempotencia (IDEMPOTENCY#<message_id>
  # en la misma tabla tickets-dev). Necesita GetItem (check pre-send) y
  # PutItem (mark post-send). La policy del módulo compute incluye también
  # Query y UpdateItem que no usamos acá — el scope sigue siendo el ARN
  # exacto de la tabla, así que el blast radius está acotado.
  attach_dynamodb_policy = true
  dynamodb_table_arn     = module.database.table_arn

  environment_variables = {
    SES_FROM_ADDRESS   = var.ses_from_address
    TICKETS_TABLE_NAME = module.database.table_name
  }
}

# Lambda chat-ws: handler para el WebSocket API (3 routes WS) + 2 endpoints
# HTTP en REST API (history + presigned upload URLs). Reutiliza el módulo
# compute. Source en infra/modules/compute/src/chat-ws/.
module "chat_ws" {
  source = "./modules/compute"

  environment     = var.environment
  name            = var.chat_ws_function_name
  source_dir      = "${path.module}/modules/compute/src/chat-ws"
  timeout_seconds = 15

  # DynamoDB: leer/escribir mensajes, conexiones, ticket metadata.
  attach_dynamodb_policy = true
  dynamodb_table_arn     = module.database.table_arn

  # S3: GetObject (presigned GET para descargas) + PutObject (presigned PUT
  # para uploads). La policy del módulo cubre ambas operaciones.
  attach_attachments_bucket_policy = true
  attachments_bucket_arn           = module.storage.bucket_arn

  # WebSocket Management: PostToConnection requerida para broadcast.
  attach_websocket_management_policy = true
  websocket_api_execution_arn        = module.realtime.api_execution_arn

  # Cognito: ID + ClientID inyectados como env vars para aws-jwt-verify
  # validar JWT en $connect.
  cognito_user_pool_id        = module.security.user_pool_id
  cognito_user_pool_client_id = module.security.user_pool_client_id

  environment_variables = {
    TICKETS_TABLE_NAME      = module.database.table_name
    ATTACHMENTS_BUCKET_NAME = module.storage.bucket_name
    COGNITO_USER_POOL_ID    = module.security.user_pool_id
    COGNITO_APP_CLIENT_ID   = module.security.user_pool_client_id
    WEBSOCKET_API_ENDPOINT  = module.realtime.management_endpoint
  }
}

# Watchdog Lambda: Trabajo automático en segundo plano que revisa periódicamente
# los tickets para marcar como "Vencido" aquellos que excedieron su SLA.
module "watchdog" {
  source = "./modules/compute"

  environment     = var.environment
  name            = "${var.project_name}-watchdog"
  source_dir      = "${path.module}/modules/compute/src/watchdog"
  handler         = "index.handler"
  memory_size     = 128
  timeout_seconds = 60

  schedule_expression    = var.watchdog_schedule
  attach_dynamodb_policy = true
  dynamodb_table_arn     = module.database.table_arn

  environment_variables = {
    TICKETS_TABLE_NAME = module.database.table_name
  }
}

module "storage" {
  source = "./modules/storage"

  environment        = var.environment
  bucket_name_prefix = var.attachments_bucket_name_prefix
}

module "database" {
  source = "./modules/database"

  environment  = var.environment
  name         = var.tickets_table_name
  billing_mode = var.db_billing_mode
}

module "security" {
  source = "./modules/security"

  environment = var.environment
  name        = var.cognito_name
}

module "api" {
  source = "./modules/api"

  environment = var.environment
  name        = var.api_name
  stage_name  = var.api_stage_name

  tickets_lambda_invoke_arn    = module.compute.function_arn
  tickets_lambda_function_name = module.compute.function_name
  chat_ws_lambda_invoke_arn    = module.chat_ws.function_arn
  chat_ws_lambda_function_name = module.chat_ws.function_name

  cognito_user_pool_arn = module.security.user_pool_arn

  cors_allow_origins = var.api_cors_allow_origins
  health_check_path  = var.api_health_check_path
}

# WebSocket API: provee las 3 routes $connect, $disconnect, sendMessage
# integradas a la Lambda chat-ws. Custom domain wss://ws.ticke-t.lumenchat.app
# habilitado cuando dns_enable_ws_custom_domain = true (reutiliza el cert
# wildcard del módulo dns).
module "realtime" {
  source = "./modules/realtime"

  environment          = var.environment
  lambda_function_arn  = module.chat_ws.function_arn
  lambda_function_name = module.chat_ws.function_name

  enable_custom_domain     = var.dns_enable_ws_custom_domain && length(module.dns) > 0
  domain_name              = var.dns_ws_full_hostname
  regional_certificate_arn = length(module.dns) > 0 ? module.dns[0].api_certificate_arn : ""
  route53_zone_id          = length(module.dns) > 0 ? module.dns[0].hosted_zone_id : ""
}

module "waf" {
  source = "./modules/waf"

  environment           = var.environment
  name                  = var.waf_name
  api_gateway_stage_arn = module.api.stage_arn
  rate_limit_per_5min   = var.waf_rate_limit_per_5min
}

# Pipeline async de notificaciones: SNS topic + SQS queue principal + DLQ.
# La tickets Lambda publica eventos al topic; el notifier Lambda los consume
# desde la SQS y manda emails vía SES. Mensajes con 3 fallos consecutivos
# (recipient inválido, SES sandbox restrictivo, etc.) van a la DLQ para
# inspección manual.
module "notifications" {
  source = "./modules/notifications"

  environment       = var.environment
  name_prefix       = var.notifications_name_prefix
  max_receive_count = var.notifications_max_receive_count
}

# Async messaging module — Deliverable A del rubric OYD-D4. SQS queue
# principal + DLQ con redrive_policy. Distinto del módulo notifications
# (que carga SNS + SQS específicos al dominio tickets); este es genérico
# y reusable para cualquier flow de message-passing en el repo.
#
# Consumido por:
#   - module.compute (tickets Lambda) como producer — POST /async/enqueue.
#   - module.async_consumer como consumer — event source mapping + S3 PutObject.
module "async" {
  source = "./modules/async"

  environment       = var.environment
  queue_name_prefix = var.async_queue_name_prefix

  visibility_timeout_seconds    = var.async_visibility_timeout_seconds
  message_retention_seconds     = var.async_message_retention_seconds
  max_receive_count             = var.async_max_receive_count
  dlq_message_retention_seconds = var.async_dlq_message_retention_seconds
}

# DNS administrado por Terraform. Solo se instancia si var.dns_parent_domain
# está seteado. Esta versión maneja la HOSTED ZONE COMPLETA del dominio
# (lumenchat.app): los nameservers del registrador apuntan acá y todos los
# records de la zona se gestionan como código.
#
# Los records inline cubren el inventario completo del dominio (apex A/AAAA,
# MX para email, TXT para SPF/DMARC, CNAMEs para www/ftp/correo/DKIM). Si en
# algún momento se agregue un record en Route 53 que no esté acá, hay que
# sumarlo a esta lista o se perderá en el próximo apply.
module "dns" {
  source = "./modules/dns"
  count  = var.dns_parent_domain != "" ? 1 : 0

  environment                = var.environment
  parent_domain              = var.dns_parent_domain
  api_full_hostname          = var.dns_api_full_hostname
  enable_api_custom_domain   = var.dns_enable_api_custom_domain
  enable_ses_domain_identity = var.dns_enable_ses_domain_identity
  api_gateway_id             = module.api.api_id
  api_gateway_stage_name     = var.api_stage_name

  # Records DNS de la zona (apex + subdominios).
  apex_a_record    = "82.25.83.178"
  apex_aaaa_record = "2a02:4780:2b:2099:0:1692:2e5b:2"
  apex_mx_records = [
    "5 mx1.hostinger.com",
    "10 mx2.hostinger.com",
  ]
  apex_txt_records = [
    "v=spf1 include:_spf.mail.hostinger.com ~all",
  ]
  subdomain_records = [
    { name = "www", type = "CNAME", value = "lumenchat.app", ttl = 300 },
    { name = "ftp", type = "A", value = "82.25.83.178", ttl = 1800 },
    { name = "autoconfig", type = "CNAME", value = "autoconfig.mail.hostinger.com", ttl = 300 },
    { name = "autodiscover", type = "CNAME", value = "autodiscover.mail.hostinger.com", ttl = 300 },
    { name = "_dmarc", type = "TXT", value = "v=DMARC1; p=none", ttl = 3600 },
    { name = "hostingermail-a._domainkey", type = "CNAME", value = "hostingermail-a.dkim.mail.hostinger.com", ttl = 300 },
    { name = "hostingermail-b._domainkey", type = "CNAME", value = "hostingermail-b.dkim.mail.hostinger.com", ttl = 300 },
    { name = "hostingermail-c._domainkey", type = "CNAME", value = "hostingermail-c.dkim.mail.hostinger.com", ttl = 300 },
  ]
}
