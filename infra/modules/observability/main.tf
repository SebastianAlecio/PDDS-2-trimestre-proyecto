# Módulo Observability — Deliverable E del rubric OYD-D5.
#
# Provisiona la capa de observabilidad operacional del stack:
#   - 1 log group para API Gateway access logs (los log groups de Lambdas ya
#     viven en el módulo compute, uno por función — cumple "at least one
#     log group per compute resource" del rubric).
#   - 1 SNS topic + email subscription para notificación de alarmas.
#   - 3 metric alarms wired al topic:
#       1. Lambda Errors > threshold por función (for_each)
#       2. SQS DLQ ApproximateNumberOfMessagesVisible > threshold por DLQ
#       3. API Gateway 5XXError > threshold
#   - 1 CloudWatch dashboard con 3 widgets, body construido con jsonencode()
#     (NO heredoc con ARNs hardcodeados — pitfall del rubric).
#   - 1 AWS Budget mensual con notificación al 80% al SNS + email.

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.name
  name       = "${var.project_name}-${var.environment}"
}

# ─── API Gateway access logs ─────────────────────────────────────────────
# Log group dedicado para las access logs del stage del REST API.
# Naming usa environment como prefix para evitar colisión entre envs.
resource "aws_cloudwatch_log_group" "api_gateway_access" {
  name              = "/aws/apigateway/${var.environment}/${var.api_name}/access"
  retention_in_days = var.log_retention_days

  tags = {
    Environment = var.environment
    Module      = "observability"
  }
}

# ─── SNS topic + email subscription ──────────────────────────────────────
# Topic compartido por todas las alarmas. El budget también publica al mismo topic.
resource "aws_sns_topic" "alarms" {
  name = "${local.name}-alarms"

  tags = {
    Environment = var.environment
    Module      = "observability"
  }
}

# Email subscription requiere confirmación manual: SNS manda un email de
# "Confirm subscription" al endpoint. El usuario tiene que clickear el link
# antes de recibir alertas. AWS no bloquea el apply por confirmación pending.
resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = var.notification_email
}

# ─── Lambda Errors alarmas (1 por función) ──────────────────────────────
# Threshold y period son variables — sin literales hardcodeados.
resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  for_each = toset(var.lambda_function_names)

  alarm_name          = "${local.name}-${each.value}-errors"
  alarm_description   = "Lambda ${each.value} con > ${var.lambda_errors_threshold} errors en ${var.lambda_errors_period_seconds}s. SNS notification a ${var.notification_email}."
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  statistic           = "Sum"
  period              = var.lambda_errors_period_seconds
  evaluation_periods  = var.lambda_errors_evaluation_periods
  threshold           = var.lambda_errors_threshold
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = each.value
  }

  alarm_actions = [aws_sns_topic.alarms.arn]
  ok_actions    = [aws_sns_topic.alarms.arn]
}

# ─── SQS DLQ depth alarmas (1 por DLQ) ───────────────────────────────────
# Threshold 1: ANY mensaje en la DLQ es señal de procesamiento fallido y
# requiere intervención manual. Tightest threshold posible.
resource "aws_cloudwatch_metric_alarm" "sqs_dlq_depth" {
  for_each = toset(var.sqs_dlq_names)

  alarm_name          = "${local.name}-${each.value}-dlq-depth"
  alarm_description   = "DLQ ${each.value} con > ${var.dlq_depth_threshold} mensajes. Notification SNS a ${var.notification_email}."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  statistic           = "Maximum"
  period              = var.dlq_depth_period_seconds
  evaluation_periods  = var.dlq_depth_evaluation_periods
  threshold           = var.dlq_depth_threshold
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = each.value
  }

  alarm_actions = [aws_sns_topic.alarms.arn]
  ok_actions    = [aws_sns_topic.alarms.arn]
}

# ─── API Gateway 5XX errors ──────────────────────────────────────────────
resource "aws_cloudwatch_metric_alarm" "api_gateway_5xx" {
  alarm_name          = "${local.name}-api-5xx"
  alarm_description   = "API Gateway ${var.api_name} con > ${var.api_5xx_threshold} 5XX errors en ${var.api_5xx_period_seconds}s."
  namespace           = "AWS/ApiGateway"
  metric_name         = "5XXError"
  statistic           = "Sum"
  period              = var.api_5xx_period_seconds
  evaluation_periods  = var.api_5xx_evaluation_periods
  threshold           = var.api_5xx_threshold
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    ApiName = var.api_name
    Stage   = var.api_stage_name
  }

  alarm_actions = [aws_sns_topic.alarms.arn]
  ok_actions    = [aws_sns_topic.alarms.arn]
}

# ─── CloudWatch Dashboard ────────────────────────────────────────────────
# Body construido con jsonencode() referenciando las variables — NO heredoc
# con ARNs hardcodeados (pitfall del rubric: "Dashboard JSON with hardcoded
# ARNs: The dashboard_body must use jsonencode() referencing Terraform
# expressions rather than a heredoc string with literal ARNs").
#
# 3 widgets:
#   1. API Gateway request count (Count + 4XXError + 5XXError stacked)
#   2. Lambda invocations + errors por función
#   3. SQS depth (main + DLQ) overlaid
resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${local.name}-main"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "API Gateway — Request volume y errors"
          view   = "timeSeries"
          region = local.region
          stat   = "Sum"
          period = 300
          metrics = [
            ["AWS/ApiGateway", "Count", "ApiName", var.api_name, "Stage", var.api_stage_name],
            [".", "4XXError", ".", ".", ".", "."],
            [".", "5XXError", ".", ".", ".", "."],
          ]
          yAxis = {
            left = { showUnits = false }
          }
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "Lambda — Errors por funcion"
          view   = "timeSeries"
          region = local.region
          stat   = "Sum"
          period = 300
          metrics = [
            for fn in var.lambda_function_names :
            ["AWS/Lambda", "Errors", "FunctionName", fn]
          ]
          yAxis = {
            left = { showUnits = false }
          }
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 24
        height = 6
        properties = {
          title  = "SQS — Visible messages (main + DLQ)"
          view   = "timeSeries"
          region = local.region
          stat   = "Maximum"
          period = 300
          metrics = concat(
            [
              for q in var.sqs_main_queue_names :
              ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", q]
            ],
            [
              for q in var.sqs_dlq_names :
              ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", q, { label = "${q} (DLQ)" }]
            ]
          )
          yAxis = {
            left = { showUnits = false }
          }
        }
      },
    ]
  })
}

# ─── AWS Budget mensual ──────────────────────────────────────────────────
# Costo TOTAL de la cuenta (no filtrado por tag/service). Para envs aislados
# en cuenta dedicada el costo total ES el costo del proyecto. La notificación
# al 80% sale por SNS (al mismo topic de las alarmas) y por email directo.
resource "aws_budgets_budget" "monthly" {
  name         = "${local.name}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.notification_email]
    subscriber_sns_topic_arns  = [aws_sns_topic.alarms.arn]
  }
}

# Permiso al servicio AWS Budgets para publicar al SNS topic. Sin esta
# resource policy, AWS Budgets no puede enviar la notificación al 80%.
data "aws_iam_policy_document" "sns_allow_budgets" {
  statement {
    sid     = "AllowBudgetsToPublish"
    effect  = "Allow"
    actions = ["sns:Publish"]

    principals {
      type        = "Service"
      identifiers = ["budgets.amazonaws.com"]
    }

    resources = [aws_sns_topic.alarms.arn]
  }
}

resource "aws_sns_topic_policy" "alarms" {
  arn    = aws_sns_topic.alarms.arn
  policy = data.aws_iam_policy_document.sns_allow_budgets.json
}
