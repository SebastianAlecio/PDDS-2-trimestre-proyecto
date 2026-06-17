# ─── IAM — Deliverable A del rubric OYD-D5 ─────────────────────────────────
# Centraliza los 6 roles runtime (5 Lambdas + 1 Scheduler) + el ci_runner role
# (OIDC) cuando enable_oidc = true. Ningún módulo abajo crea roles inline —
# todos consumen los ARNs como inputs.
#
# OIDC se mantiene en false acá (Task 3 lo activa). Cuando se active, hay que
# proveer github_owner y github_repo (vienen de root vars).
module "iam" {
  source = "./modules/iam"

  environment  = var.environment
  project_name = var.project_name

  # ARNs de recursos consumidos por las policies.
  tickets_table_arn           = module.database.table_arn
  attachments_bucket_arn      = module.storage.bucket_arn
  cognito_user_pool_arn       = module.security.user_pool_arn
  notifications_sns_topic_arn = module.notifications.sns_topic_arn
  notifications_sqs_queue_arn = module.notifications.sqs_queue_arn
  async_sqs_queue_arn         = module.async.queue_arn
  websocket_api_execution_arn = module.realtime.api_execution_arn
  ses_domain                  = var.dns_parent_domain
  ses_from_address            = var.ses_from_address

  # Function base names — iam construye los log group ARNs y el watchdog
  # function ARN por convención ($${base}-$${environment}). Evita ciclo
  # iam ↔ compute.
  tickets_function_base_name        = var.compute_function_name
  chat_ws_function_base_name        = var.chat_ws_function_name
  notifier_function_base_name       = "ticket-notifier"
  async_consumer_function_base_name = "${var.project_name}-async-consumer"
  watchdog_function_base_name       = "${var.project_name}-watchdog"

  # OIDC: se activa en Task 3 — cuando enable_oidc = true se necesitan los
  # 2 inputs de github_*. Mientras tanto, valores vacíos por default.
  enable_oidc  = var.enable_github_oidc
  github_owner = var.github_owner
  github_repo  = var.github_repo
}

# ─── Tickets Lambda (REST API handler) ─────────────────────────────────────
module "compute" {
  source = "./modules/compute"

  environment = var.environment
  name        = var.compute_function_name
  memory_size = var.compute_memory_size

  execution_role_arn = module.iam.tickets_lambda_role_arn

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

# ─── Async consumer Lambda — OYD-D4 Deliverable E ─────────────────────────
# Recibe records via event source mapping desde el async queue. Por cada
# mensaje escribe UN objeto a S3 bajo async-events/<message_id>.json y, si
# el evento es ticket.expired, manda email vía SES al solicitante.
module "async_consumer" {
  source = "./modules/compute"

  environment     = var.environment
  name            = "${var.project_name}-async-consumer"
  source_dir      = "${path.module}/modules/compute/src/async-consumer"
  timeout_seconds = 30
  memory_size     = 128

  execution_role_arn = module.iam.async_consumer_lambda_role_arn

  # SQS event source mapping (la policy de consume vive en iam/).
  attach_sqs_event_source_mapping    = true
  sqs_event_source_queue_arn         = module.async.queue_arn
  sqs_batch_size                     = 1
  maximum_batching_window_in_seconds = 0
  bisect_batch_on_function_error     = true

  environment_variables = {
    ASYNC_BUCKET_NAME       = module.storage.bucket_name
    ASYNC_BUCKET_KEY_PREFIX = "async-events/"
    SES_FROM_ADDRESS        = var.ses_from_address
  }
}

# ─── Notifier Lambda — Cloud E4 ────────────────────────────────────────────
# Consumer de la SQS suscripta al topic SNS. Por cada mensaje (ticket.closed)
# manda email vía SES al solicitante.correo, con record de idempotencia en DDB.
module "notifier" {
  source = "./modules/compute"

  environment     = var.environment
  name            = "ticket-notifier"
  source_dir      = "${path.module}/modules/compute/src/notifier"
  timeout_seconds = 15

  execution_role_arn = module.iam.notifier_lambda_role_arn

  attach_sqs_event_source_mapping = true
  sqs_event_source_queue_arn      = module.notifications.sqs_queue_arn

  environment_variables = {
    SES_FROM_ADDRESS   = var.ses_from_address
    TICKETS_TABLE_NAME = module.database.table_name
  }
}

# ─── chat-ws Lambda — WebSocket API handler + HTTP chat endpoints ─────────
module "chat_ws" {
  source = "./modules/compute"

  environment     = var.environment
  name            = var.chat_ws_function_name
  source_dir      = "${path.module}/modules/compute/src/chat-ws"
  timeout_seconds = 15

  execution_role_arn = module.iam.chat_ws_lambda_role_arn

  environment_variables = {
    TICKETS_TABLE_NAME      = module.database.table_name
    ATTACHMENTS_BUCKET_NAME = module.storage.bucket_name
    COGNITO_USER_POOL_ID    = module.security.user_pool_id
    COGNITO_APP_CLIENT_ID   = module.security.user_pool_client_id
    WEBSOCKET_API_ENDPOINT  = module.realtime.management_endpoint
  }
}

# ─── Watchdog Lambda — barrido periódico de SLA ───────────────────────────
# Trigger: aws_scheduler_schedule (EventBridge Scheduler v2 — OYD-D4 Del C).
# Por cada ticket vencido, publica ticket.expired al async queue.
module "watchdog" {
  source = "./modules/compute"

  environment     = var.environment
  name            = "${var.project_name}-watchdog"
  source_dir      = "${path.module}/modules/compute/src/watchdog"
  handler         = "index.handler"
  memory_size     = 128
  timeout_seconds = 60

  execution_role_arn = module.iam.watchdog_lambda_role_arn
  scheduler_role_arn = module.iam.scheduler_invoke_role_arn

  attach_scheduler    = true
  schedule_expression = var.watchdog_schedule
  scheduler_timezone  = var.watchdog_timezone

  environment_variables = {
    TICKETS_TABLE_NAME = module.database.table_name
    ASYNC_QUEUE_URL    = module.async.queue_url
  }
}

# ─── KMS — Deliverable B del rubric OYD-D5 ─────────────────────────────────
# CMK que encripta S3 (attachments + async-events) y DynamoDB. Reemplaza:
#   - SSE-S3 (AES256) que estaba activo en storage/ desde D2
#   - DynamoDB AWS-managed default key
# La key policy autoriza al service principal correspondiente vía kms:ViaService
# y a las 5 Lambda execution roles para Decrypt/GenerateDataKey en lecturas.
module "kms" {
  source = "./modules/kms"

  environment        = var.environment
  project_name       = var.project_name
  consumer_role_arns = module.iam.all_lambda_role_arns
}

# ─── Capa de almacenamiento ──────────────────────────────────────────────
module "storage" {
  source = "./modules/storage"

  environment        = var.environment
  bucket_name_prefix = var.attachments_bucket_name_prefix
  kms_key_arn        = module.kms.key_arn
}

module "database" {
  source = "./modules/database"

  environment  = var.environment
  name         = var.tickets_table_name
  billing_mode = var.db_billing_mode
  kms_key_arn  = module.kms.key_arn
}

module "security" {
  source = "./modules/security"

  environment = var.environment
  name        = var.cognito_name
}

# ─── API Gateway REST + WebSocket ────────────────────────────────────────
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

# ─── Pipeline async de notificaciones (Cloud E4) ─────────────────────────
module "notifications" {
  source = "./modules/notifications"

  environment       = var.environment
  name_prefix       = var.notifications_name_prefix
  max_receive_count = var.notifications_max_receive_count
}

# ─── Async messaging module (OYD-D4 Deliverable A) ───────────────────────
module "async" {
  source = "./modules/async"

  environment       = var.environment
  queue_name_prefix = var.async_queue_name_prefix

  visibility_timeout_seconds    = var.async_visibility_timeout_seconds
  message_retention_seconds     = var.async_message_retention_seconds
  max_receive_count             = var.async_max_receive_count
  dlq_message_retention_seconds = var.async_dlq_message_retention_seconds
}

# ─── Observability (OYD-D5 Deliverable E) ──────────────────────────────────
# Log group del API access log, SNS topic + email subscription, 3 metric alarms
# (Lambda Errors x5 funciones, SQS DLQ depth x2 colas, API GW 5XX), dashboard
# con 3 widgets via jsonencode, budget mensual con 80% threshold.
module "observability" {
  source = "./modules/observability"

  environment        = var.environment
  project_name       = var.project_name
  log_retention_days = var.log_retention_days
  notification_email = var.notification_email
  monthly_budget_usd = var.monthly_budget_usd

  api_name       = "${var.api_name}-${var.environment}"
  api_stage_name = var.api_stage_name

  lambda_function_names = [
    module.compute.function_name,
    module.chat_ws.function_name,
    module.notifier.function_name,
    module.async_consumer.function_name,
    module.watchdog.function_name,
  ]

  sqs_main_queue_names = [
    module.notifications.sqs_queue_name,
    module.async.queue_name,
  ]

  sqs_dlq_names = [
    module.notifications.dlq_name,
    module.async.dlq_name,
  ]
}

# ─── CDN / Frontend (OYD-D5 Deliverable D) ─────────────────────────────────
# CloudFront + S3 privado + Route 53 alias para `app.ticke-t.lumenchat.app`.
# Cierra el último endpoint público con TLS + 301 redirect explicit desde
# port 80. Reutiliza el cert wildcard ACM del módulo dns (sin duplicar).
module "cdn" {
  source = "./modules/cdn"
  count  = var.enable_frontend_cdn && length(module.dns) > 0 ? 1 : 0

  environment         = var.environment
  project_name        = var.project_name
  full_hostname       = var.frontend_full_hostname
  acm_certificate_arn = module.dns[0].api_certificate_arn
  hosted_zone_id      = module.dns[0].hosted_zone_id
  create_dns_record   = true
}

# ─── DNS (Route 53 + ACM + SES identity) ─────────────────────────────────
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
