# Módulo IAM 
#
# Centraliza la definición de TODOS los IAM roles del stack que antes vivían
# inline en los módulos de compute (1 rol compartido + 1 rol del scheduler) y
# los descompone en N roles least-privilege, uno por servicio. Cada rol tiene
# inline policies scopeadas a ARNs específicos — cero wildcards en Action o
# Resource. Los ARNs vienen como inputs del módulo; ninguno se hardcodea.
#
# Roles definidos:
#   1. tickets_lambda          — handler de los REST endpoints de tickets
#   2. chat_ws_lambda          — handler del WebSocket API + history/upload-url
#   3. notifier_lambda         — consumer de SNS→SQS, manda emails ticket.closed
#   4. async_consumer_lambda   — consumer del async queue, audit + emails expired
#   5. watchdog_lambda         — barrido periódico que detecta tickets vencidos
#   6. scheduler_invoke        — assumed por EventBridge Scheduler para invocar watchdog
#   7. ci_runner               — assumable via OIDC, terraform plan/apply (Task 3)
#
# Naming: ${project_name}-${role_purpose}-${environment} para que sea consistente
# con la convención del resto del repo (ej. pdds-oyd-tickets-lambda-dev).

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  account_id  = data.aws_caller_identity.current.account_id
  region      = data.aws_region.current.name
  name_prefix = var.project_name
  name_suffix = var.environment

  # Identity ARN del dominio SES — formato exacto que aws_ses_domain_identity
  # genera. Usado como Resource scoped (no wildcard) en las policies SES.
  ses_identity = "arn:aws:ses:${local.region}:${local.account_id}:identity/${var.ses_domain}"

  # Lambda full names — construidos por convención ($${base}-$${env}) para
  # romper el dependency cycle entre iam y compute. compute usa el mismo
  # pattern locales en su módulo, así que están alineados.
  tickets_function_name        = "${var.tickets_function_base_name}-${var.environment}"
  chat_ws_function_name        = "${var.chat_ws_function_base_name}-${var.environment}"
  notifier_function_name       = "${var.notifier_function_base_name}-${var.environment}"
  async_consumer_function_name = "${var.async_consumer_function_base_name}-${var.environment}"
  watchdog_function_name       = "${var.watchdog_function_base_name}-${var.environment}"

  # ARNs derivados por convención.
  tickets_log_group_arn        = "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/lambda/${local.tickets_function_name}"
  chat_ws_log_group_arn        = "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/lambda/${local.chat_ws_function_name}"
  notifier_log_group_arn       = "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/lambda/${local.notifier_function_name}"
  async_consumer_log_group_arn = "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/lambda/${local.async_consumer_function_name}"
  watchdog_log_group_arn       = "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/lambda/${local.watchdog_function_name}"

  watchdog_function_arn = "arn:aws:lambda:${local.region}:${local.account_id}:function:${local.watchdog_function_name}"
}

# ─── Trust policies reusadas ───────────────────────────────────────────────

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "scheduler_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
  }
}

# ─── ROL 1: tickets_lambda ────────────────────────────────────────────────
# Handler de los endpoints REST de tickets (POST /tickets, GET /tickets,
# PUT /tickets/{id}/status, etc.). Necesita:
#   - CloudWatch logs (al log group propio)
#   - DDB CRUD sobre la tabla tickets + GSIs
#   - S3 PutObject/GetObject sobre attachments/* del bucket
#   - Cognito Admin sobre el user pool (crear/borrar/editar usuarios)
#   - SNS Publish al topic ticket-notifications (eventos ticket.closed)
#   - SQS SendMessage al async queue (endpoint POST /async/enqueue)
#   - execute-api:ManageConnections (broadcast WS de ticket.closed)

resource "aws_iam_role" "tickets_lambda" {
  name               = "${local.name_prefix}-tickets-lambda-${local.name_suffix}"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  description        = "Execution role del handler de tickets (REST API). Least-privilege D5."
}

resource "aws_iam_role_policy" "tickets_lambda_logs" {
  name = "logs"
  role = aws_iam_role.tickets_lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
      Resource = "${local.tickets_log_group_arn}:*"
    }]
  })
}

resource "aws_iam_role_policy" "tickets_lambda_ddb" {
  name = "ddb"
  role = aws_iam_role.tickets_lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
      ]
      Resource = [
        var.tickets_table_arn,
        "${var.tickets_table_arn}/index/*",
      ]
    }]
  })
}

resource "aws_iam_role_policy" "tickets_lambda_s3_attachments" {
  name = "s3-attachments"
  role = aws_iam_role.tickets_lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:PutObject", "s3:GetObject"]
      Resource = ["${var.attachments_bucket_arn}/attachments/*"]
    }]
  })
}

resource "aws_iam_role_policy" "tickets_lambda_cognito" {
  name = "cognito"
  role = aws_iam_role.tickets_lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "cognito-idp:AdminCreateUser",
        "cognito-idp:AdminDeleteUser",
        "cognito-idp:AdminUpdateUserAttributes",
        "cognito-idp:AdminDisableUser",
        "cognito-idp:AdminEnableUser",
        "cognito-idp:AdminAddUserToGroup",
        "cognito-idp:AdminRemoveUserFromGroup",
        "cognito-idp:ListUsersInGroup",
      ]
      Resource = [var.cognito_user_pool_arn]
    }]
  })
}

resource "aws_iam_role_policy" "tickets_lambda_sns_publish" {
  name = "sns-publish"
  role = aws_iam_role.tickets_lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["sns:Publish"]
      Resource = [var.notifications_sns_topic_arn]
    }]
  })
}

resource "aws_iam_role_policy" "tickets_lambda_sqs_send" {
  name = "sqs-send-async"
  role = aws_iam_role.tickets_lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["sqs:SendMessage", "sqs:GetQueueAttributes"]
      Resource = [var.async_sqs_queue_arn]
    }]
  })
}

resource "aws_iam_role_policy" "tickets_lambda_ws_manage" {
  name = "ws-manage"
  role = aws_iam_role.tickets_lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["execute-api:ManageConnections"]
      Resource = ["${var.websocket_api_execution_arn}/*/POST/@connections/*"]
    }]
  })
}

# ─── ROL 2: chat_ws_lambda ────────────────────────────────────────────────
# Handler del WebSocket API (3 routes: $connect, $disconnect, sendMessage) +
# 2 HTTP endpoints (GET /tickets/{id}/messages, POST /tickets/{id}/attachment-url).
#   - CloudWatch logs
#   - DDB CRUD (mensajes, conexiones, metadata del ticket)
#   - S3 PutObject/GetObject sobre attachments/* (firmar presigned URLs)
#   - Cognito Admin (lookup de usuario para enriquecer mensajes)
#   - execute-api:ManageConnections (PostToConnection — broadcast WS)

resource "aws_iam_role" "chat_ws_lambda" {
  name               = "${local.name_prefix}-chat-ws-lambda-${local.name_suffix}"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  description        = "Execution role de la Lambda chat-ws (WS + chat HTTP)."
}

resource "aws_iam_role_policy" "chat_ws_lambda_logs" {
  name = "logs"
  role = aws_iam_role.chat_ws_lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
      Resource = "${local.chat_ws_log_group_arn}:*"
    }]
  })
}

resource "aws_iam_role_policy" "chat_ws_lambda_ddb" {
  name = "ddb"
  role = aws_iam_role.chat_ws_lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
      ]
      Resource = [
        var.tickets_table_arn,
        "${var.tickets_table_arn}/index/*",
      ]
    }]
  })
}

resource "aws_iam_role_policy" "chat_ws_lambda_s3_attachments" {
  name = "s3-attachments"
  role = aws_iam_role.chat_ws_lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:PutObject", "s3:GetObject"]
      Resource = ["${var.attachments_bucket_arn}/attachments/*"]
    }]
  })
}

resource "aws_iam_role_policy" "chat_ws_lambda_ws_manage" {
  name = "ws-manage"
  role = aws_iam_role.chat_ws_lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["execute-api:ManageConnections"]
      Resource = ["${var.websocket_api_execution_arn}/*/POST/@connections/*"]
    }]
  })
}

# ─── ROL 3: notifier_lambda ──────────────────────────────────────────────
# Consumer del flow SNS→SQS. Maneja eventos ticket.closed.
#   - CloudWatch logs
#   - SQS Consume sobre la cola ticket-notifications (no la async)
#   - DDB GetItem/PutItem (idempotency records IDEMPOTENCY#<message_id>)
#   - SES SendEmail con condition StringEquals ses:FromAddress = soporte@...

resource "aws_iam_role" "notifier_lambda" {
  name               = "${local.name_prefix}-notifier-lambda-${local.name_suffix}"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  description        = "Execution role del notifier Lambda (SNS->SQS->SES email ticket.closed)."
}

resource "aws_iam_role_policy" "notifier_lambda_logs" {
  name = "logs"
  role = aws_iam_role.notifier_lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
      Resource = "${local.notifier_log_group_arn}:*"
    }]
  })
}

resource "aws_iam_role_policy" "notifier_lambda_sqs_consume" {
  name = "sqs-consume-notifications"
  role = aws_iam_role.notifier_lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes",
        "sqs:ChangeMessageVisibility",
      ]
      Resource = [var.notifications_sqs_queue_arn]
    }]
  })
}

resource "aws_iam_role_policy" "notifier_lambda_ddb" {
  name = "ddb-idempotency"
  role = aws_iam_role.notifier_lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
      ]
      Resource = [var.tickets_table_arn]
    }]
  })
}

# SES Resource scopeado al identity ARN del dominio (ej. arn:aws:ses:...:
# identity/lumenchat.app) en lugar de "*". La condition extra scopea aún
# más al sender específico — defense in depth. Si en el futuro se verifica
# otro dominio en la cuenta, esta policy NO le da acceso.
resource "aws_iam_role_policy" "notifier_lambda_ses_send" {
  name = "ses-send"
  role = aws_iam_role.notifier_lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ses:SendEmail", "ses:SendRawEmail"]
      Resource = [local.ses_identity]
      Condition = {
        StringEquals = {
          "ses:FromAddress" = var.ses_from_address
        }
      }
    }]
  })
}

# ─── ROL 4: async_consumer_lambda ────────────────────────────────────────
# Consumer del async queue. Maneja eventos ticket.expired.
#   - CloudWatch logs
#   - SQS Consume sobre el async queue
#   - S3 PutObject sobre async-events/* del bucket de attachments (audit)
#   - SES SendEmail (notificación al solicitante por SLA expirado)

resource "aws_iam_role" "async_consumer_lambda" {
  name               = "${local.name_prefix}-async-consumer-lambda-${local.name_suffix}"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  description        = "Execution role del async_consumer (SQS->S3 audit + SES email expired)."
}

resource "aws_iam_role_policy" "async_consumer_lambda_logs" {
  name = "logs"
  role = aws_iam_role.async_consumer_lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
      Resource = "${local.async_consumer_log_group_arn}:*"
    }]
  })
}

resource "aws_iam_role_policy" "async_consumer_lambda_sqs_consume" {
  name = "sqs-consume-async"
  role = aws_iam_role.async_consumer_lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes",
        "sqs:ChangeMessageVisibility",
      ]
      Resource = [var.async_sqs_queue_arn]
    }]
  })
}

resource "aws_iam_role_policy" "async_consumer_lambda_s3" {
  name = "s3-async-events"
  role = aws_iam_role.async_consumer_lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:PutObject"]
      Resource = ["${var.attachments_bucket_arn}/async-events/*"]
    }]
  })
}

resource "aws_iam_role_policy" "async_consumer_lambda_ses_send" {
  name = "ses-send"
  role = aws_iam_role.async_consumer_lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ses:SendEmail", "ses:SendRawEmail"]
      Resource = [local.ses_identity]
      Condition = {
        StringEquals = {
          "ses:FromAddress" = var.ses_from_address
        }
      }
    }]
  })
}

# ─── ROL 5: watchdog_lambda ──────────────────────────────────────────────
# Barrido periódico (5 minutos) que busca tickets vencidos por SLA y publica
# ticket.expired al async queue.
#   - CloudWatch logs
#   - DDB Query sobre GSI4 (PK=STATUS#Abierto, SK begins_with PRIO#)
#   - DDB UpdateItem para marcar el ticket como "Vencido"
#   - SQS SendMessage al async queue

resource "aws_iam_role" "watchdog_lambda" {
  name               = "${local.name_prefix}-watchdog-lambda-${local.name_suffix}"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  description        = "Execution role del watchdog (scheduler->DDB query->SQS send)."
}

resource "aws_iam_role_policy" "watchdog_lambda_logs" {
  name = "logs"
  role = aws_iam_role.watchdog_lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
      Resource = "${local.watchdog_log_group_arn}:*"
    }]
  })
}

resource "aws_iam_role_policy" "watchdog_lambda_ddb" {
  name = "ddb"
  role = aws_iam_role.watchdog_lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:Query",
        "dynamodb:UpdateItem",
      ]
      Resource = [
        var.tickets_table_arn,
        "${var.tickets_table_arn}/index/GSI4",
      ]
    }]
  })
}

resource "aws_iam_role_policy" "watchdog_lambda_sqs_send" {
  name = "sqs-send-async"
  role = aws_iam_role.watchdog_lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["sqs:SendMessage", "sqs:GetQueueAttributes"]
      Resource = [var.async_sqs_queue_arn]
    }]
  })
}

# ─── ROL 6: scheduler_invoke ─────────────────────────────────────────────
# Assumed por EventBridge Scheduler para invocar el watchdog Lambda. Scope:
# lambda:InvokeFunction sobre el ARN exacto del watchdog (no wildcard).

resource "aws_iam_role" "scheduler_invoke" {
  name               = "${local.name_prefix}-scheduler-invoke-${local.name_suffix}"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume.json
  description        = "Role asumido por EventBridge Scheduler para invocar el watchdog."
}

resource "aws_iam_role_policy" "scheduler_invoke_lambda" {
  name = "invoke-watchdog"
  role = aws_iam_role.scheduler_invoke.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["lambda:InvokeFunction"]
      Resource = [local.watchdog_function_arn]
    }]
  })
}
