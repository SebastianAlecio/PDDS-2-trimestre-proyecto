locals {
  function_name = "${var.name}-${var.environment}"
  source_dir    = var.source_dir != "" ? var.source_dir : "${path.module}/src"
}

resource "aws_iam_role" "lambda_exec" {
  name = "${local.function_name}-exec"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${local.function_name}"
  retention_in_days = var.log_retention_days
}

resource "aws_iam_role_policy" "lambda_logs" {
  name = "${local.function_name}-logs"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "logs:CreateLogStream",
        "logs:PutLogEvents",
      ]
      Resource = "${aws_cloudwatch_log_group.lambda.arn}:*"
    }]
  })
}

# Si la Lambda tiene package.json (depende de paquetes npm como
# @aws-sdk/s3-request-presigner que no vienen en el runtime de Node 22),
# corremos `npm install` antes del archive_file para que node_modules entre
# al zip. Trigger por hash de package.json + package-lock.json (si existe)
# fuerza re-instalación cuando las deps cambian.
resource "null_resource" "npm_install" {
  count = fileexists("${local.source_dir}/package.json") ? 1 : 0

  triggers = {
    package_json = filemd5("${local.source_dir}/package.json")
    lock_exists  = fileexists("${local.source_dir}/package-lock.json") ? filemd5("${local.source_dir}/package-lock.json") : ""
  }

  provisioner "local-exec" {
    working_dir = local.source_dir
    command     = "npm install --omit=dev --no-audit --no-fund"
  }
}

data "archive_file" "lambda" {
  type        = "zip"
  source_dir  = local.source_dir
  output_path = "${path.module}/build/${local.function_name}.zip"

  # Asegura que npm_install corra antes de calcular el hash del zip cuando
  # hay package.json. Sin esto, el primer plan ve la src sin node_modules.
  depends_on = [null_resource.npm_install]
}

resource "aws_lambda_function" "this" {
  function_name = local.function_name
  role          = aws_iam_role.lambda_exec.arn
  handler       = var.handler
  runtime       = var.runtime
  architectures = var.architectures
  memory_size   = var.memory_size
  timeout       = var.timeout_seconds

  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256

  dynamic "environment" {
    for_each = length(var.environment_variables) > 0 ? [1] : []
    content {
      variables = var.environment_variables
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.lambda,
    aws_iam_role_policy.lambda_logs,
  ]
}

resource "aws_iam_role_policy" "lambda_dynamodb" {
  count = var.attach_dynamodb_policy ? 1 : 0

  name = "${local.function_name}-dynamodb"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      # PutItem/Query/GetItem/UpdateItem para tickets domain. DeleteItem
      # agregado para chat-ws Lambda: limpiar CONN# items en $disconnect y
      # reactivamente cuando PostToConnection devuelve GoneException.
      Action = [
        "dynamodb:PutItem",
        "dynamodb:Query",
        "dynamodb:GetItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
      ]
      Resource = [
        var.dynamodb_table_arn,
        "${var.dynamodb_table_arn}/index/*",
      ]
    }]
  })
}

# Permite a la Lambda escribir objetos al bucket de adjuntos, scoped al
# prefix attachments/* (no a la raíz del bucket). En esta tanda escribimos
# solo metadata JSON; cuando agreguemos presigned URLs el contenido cambia
# pero el scope IAM permanece igual.
resource "aws_iam_role_policy" "lambda_attachments_bucket" {
  count = var.attach_attachments_bucket_policy ? 1 : 0

  name = "${local.function_name}-attachments-bucket"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      # PutObject: el handler de crear ticket escribe metadata + el chat-ws
      # firma presigned PUT URLs (la URL hereda los permisos del firmante).
      # GetObject: chat-ws firma presigned GET URLs para que el frontend
      # descargue/renderice adjuntos del chat.
      Action   = ["s3:PutObject", "s3:GetObject"]
      Resource = ["${var.attachments_bucket_arn}/attachments/*"]
    }]
  })
}

# Permite a la Lambda administrar usuarios y grupos en Cognito
resource "aws_iam_role_policy" "lambda_cognito" {
  count = var.attach_cognito_policy ? 1 : 0

  name = "${local.function_name}-cognito"
  role = aws_iam_role.lambda_exec.id

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
        "cognito-idp:AdminRemoveUserFromGroup"
      ]
      Resource = [var.cognito_user_pool_arn]
    }]
  })
}

# ─── SNS publish ─────────────────────────────────────────────────────────
#
# Permite a la Lambda publicar mensajes al topic SNS específico. Scoped al
# ARN del topic (no permite publicar a otros topics de la cuenta).
resource "aws_iam_role_policy" "lambda_sns_publish" {
  count = var.attach_sns_publish_policy ? 1 : 0

  name = "${local.function_name}-sns-publish"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["sns:Publish"]
      Resource = [var.sns_topic_arn]
    }]
  })
}

# ─── SQS consume ─────────────────────────────────────────────────────────
#
# Permisos requeridos por el aws_lambda_event_source_mapping para que el
# servicio de Lambda haga long-polling sobre la cola y entregue mensajes a
# la función. Scoped al ARN exacto de la cola.
resource "aws_iam_role_policy" "lambda_sqs_consume" {
  count = var.attach_sqs_consume_policy ? 1 : 0

  name = "${local.function_name}-sqs-consume"
  role = aws_iam_role.lambda_exec.id

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
      Resource = [var.sqs_queue_arn]
    }]
  })
}

# Event source mapping: conecta la cola con la Lambda. El servicio Lambda
# hace long-polling y entrega batches de mensajes al handler. batch_size
# controla el throughput vs facilidad de debug (1 = un mensaje por
# invocación, retry granular). Si el handler tira un error, el batch
# completo vuelve a la cola y el receive_count se incrementa — eso es lo
# que mueve mensajes a la DLQ después de max_receive_count intentos.
resource "aws_lambda_event_source_mapping" "sqs" {
  count = var.attach_sqs_consume_policy ? 1 : 0

  event_source_arn = var.sqs_queue_arn
  function_name    = aws_lambda_function.this.arn
  batch_size       = var.sqs_batch_size
  enabled          = true

  depends_on = [aws_iam_role_policy.lambda_sqs_consume]
}

# ─── SES SendEmail ───────────────────────────────────────────────────────
#
# Permite a la Lambda mandar emails vía SES. La condition StringEquals sobre
# ses:FromAddress restringe el remitente: aunque el dominio entero esté
# verificado en SES, esta Lambda solo puede mandar desde la dirección
# específica configurada (ej. soporte@lumenchat.app). Sin esta condition,
# cualquier address verificado del dominio podría usarse.
resource "aws_iam_role_policy" "lambda_ses_send" {
  count = var.attach_ses_send_policy ? 1 : 0

  name = "${local.function_name}-ses-send"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ses:SendEmail", "ses:SendRawEmail"]
      Resource = "*"
      Condition = {
        StringEquals = {
          "ses:FromAddress" = var.ses_from_address
        }
      }
    }]
  })
}

# ─── WebSocket Management ────────────────────────────────────────────────
# Necesario para PostToConnection. Scope: solo este WebSocket API específico.
resource "aws_iam_role_policy" "lambda_websocket_management" {
  count = var.attach_websocket_management_policy ? 1 : 0

  name = "${local.function_name}-ws-mgmt"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["execute-api:ManageConnections"]
      Resource = ["${var.websocket_api_execution_arn}/*/POST/@connections/*"]
    }]
  })
}
