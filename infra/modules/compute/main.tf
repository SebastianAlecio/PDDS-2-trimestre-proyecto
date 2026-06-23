locals {
  function_name = "${var.name}-${var.environment}"
  source_dir    = var.source_dir != "" ? var.source_dir : "${path.module}/src"
}

# CloudWatch log group de la función. Naming matchea el log group ARN que el
# módulo iam construye por convención (arn:aws:logs:...:log-group:/aws/lambda/${function_name}).
resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${local.function_name}"
  retention_in_days = var.log_retention_days
}

resource "null_resource" "npm_install" {
  count = fileexists("${local.source_dir}/package.json") ? 1 : 0

  triggers = {
    package_json = filemd5("${local.source_dir}/package.json")
    lock_exists  = fileexists("${local.source_dir}/package-lock.json") ? filemd5("${local.source_dir}/package-lock.json") : ""
    # Detecta runners frios (CI nuevo, git clean local, etc.): si node_modules
    # no esta presente, el trigger cambia y fuerza re-correr el provisioner.
    # Sin esto, terraform veia "package.json no cambio" -> omitia el local-exec
    # -> archive_file empaquetaba sin deps -> Lambda lanzaba Runtime.ImportModuleError
    # al primer invoke (ej. "Cannot find module 'aws-jwt-verify'" en chat-ws).
    node_modules_present = fileexists("${local.source_dir}/node_modules/.package-lock.json") ? "yes" : "no"
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

# Función Lambda. El role viene del módulo iam/ como input.
resource "aws_lambda_function" "this" {
  function_name = local.function_name
  role          = var.execution_role_arn
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

  depends_on = [aws_cloudwatch_log_group.lambda]
}

# ─── SQS event source mapping ────────────────────────────────────────────
# Conecta una cola SQS con la Lambda (long-polling + entrega de batches). La
# IAM policy que permite sqs:ReceiveMessage/DeleteMessage/etc vive en el
# módulo iam/ (en el rol correspondiente). Acá solo se crea el resource del
# mapping cuando attach_sqs_event_source_mapping = true.
resource "aws_lambda_event_source_mapping" "sqs" {
  count = var.attach_sqs_event_source_mapping ? 1 : 0

  event_source_arn                   = var.sqs_event_source_queue_arn
  function_name                      = aws_lambda_function.this.arn
  batch_size                         = var.sqs_batch_size
  maximum_batching_window_in_seconds = var.maximum_batching_window_in_seconds
  enabled                            = true
}

# ─── EventBridge Schedule LEGACY (aws_cloudwatch_event_rule) ──────────────
# Solo se crea si attach_scheduler = false y schedule_expression != ""
resource "aws_cloudwatch_event_rule" "schedule" {
  count               = var.schedule_expression != "" && !var.attach_scheduler ? 1 : 0
  name                = "${local.function_name}-schedule"
  description         = "Ejecuta ${local.function_name} periódicamente (legacy CloudWatch Events)"
  schedule_expression = var.schedule_expression
}

resource "aws_cloudwatch_event_target" "lambda_schedule" {
  count = var.schedule_expression != "" && !var.attach_scheduler ? 1 : 0
  rule  = aws_cloudwatch_event_rule.schedule[0].name
  arn   = aws_lambda_function.this.arn
}

resource "aws_lambda_permission" "eventbridge_invoke" {
  count         = var.schedule_expression != "" && !var.attach_scheduler ? 1 : 0
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.this.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.schedule[0].arn
}

# ─── EventBridge Scheduler (OYD-D4 Deliverable C — API nueva) ─────────────
# El role asumido por el scheduler para invocar la Lambda viene del módulo
# iam/ como var.scheduler_role_arn
resource "aws_scheduler_schedule" "this" {
  count = var.attach_scheduler ? 1 : 0

  name        = "${local.function_name}-schedule-v2"
  description = "EventBridge Scheduler que invoca ${local.function_name} periódicamente"
  state       = var.scheduler_state

  flexible_time_window {
    mode = "OFF"
  }

  schedule_expression          = var.schedule_expression
  schedule_expression_timezone = var.scheduler_timezone

  target {
    arn      = aws_lambda_function.this.arn
    role_arn = var.scheduler_role_arn

    retry_policy {
      maximum_event_age_in_seconds = 3600
      maximum_retry_attempts       = 3
    }
  }
}
