locals {
  topic_name = "${var.name_prefix}-${var.environment}"
  queue_name = "${var.name_prefix}-${var.environment}"
  dlq_name   = "${var.name_prefix}-${var.environment}-dlq"
}

# ─── SNS topic para eventos del dominio tickets ─────────────────────────────
#
# Hoy solo publicamos "ticket.closed". El topic queda con shape genérica
# (event + payload) para sumar otros eventos (created, assigned) sin recrear
# el recurso. Los suscriptores pueden filtrar por message attribute en el
# futuro si crece el catálogo de eventos.
resource "aws_sns_topic" "ticket_events" {
  name = local.topic_name

  tags = {
    Environment = var.environment
  }
}

# ─── DLQ ────────────────────────────────────────────────────────────────────
#
# Recibe mensajes que la cola principal no pudo entregar exitosamente después
# de max_receive_count intentos. Sin suscriptores: la inspección es manual
# (CloudWatch metric + consola SQS). Retención larga para dar ventana de
# análisis post-incidente.
resource "aws_sqs_queue" "dlq" {
  name                       = local.dlq_name
  message_retention_seconds  = var.dlq_retention_seconds
  visibility_timeout_seconds = var.visibility_timeout_seconds

  tags = {
    Environment = var.environment
  }
}

# ─── Cola principal ─────────────────────────────────────────────────────────
#
# El consumer Lambda (notifier) hace polling sobre esta cola via
# aws_lambda_event_source_mapping. visibility_timeout_seconds debe ser >= al
# timeout de la Lambda — sino el mensaje reaparece mientras la Lambda
# todavía está procesando y se duplica el trabajo.
#
# redrive_policy: configura la transición a DLQ. SQS mueve el mensaje cuando
# el receive count supera max_receive_count (cada delivery fallida cuenta).
resource "aws_sqs_queue" "ticket_notifications" {
  name                       = local.queue_name
  message_retention_seconds  = var.message_retention_seconds
  visibility_timeout_seconds = var.visibility_timeout_seconds

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = var.max_receive_count
  })

  tags = {
    Environment = var.environment
  }
}

# ─── Subscription SNS → SQS ─────────────────────────────────────────────────
#
# El topic publica cada mensaje a esta cola. raw_message_delivery = false
# (default) hace que el mensaje llegue envuelto en la estructura SNS
# notification (con campos Type, MessageId, Message, etc.). El consumer
# Lambda parsea ese wrapper para extraer el payload original.
resource "aws_sns_topic_subscription" "ticket_events_to_sqs" {
  topic_arn = aws_sns_topic.ticket_events.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.ticket_notifications.arn
}

# ─── SQS queue policy: permite a SNS escribir mensajes ──────────────────────
#
# Sin esta policy, SNS no tiene permiso para hacer SendMessage a la cola y
# el subscription falla silenciosamente (los mensajes nunca llegan a SQS).
# Condition aws:SourceArn restringe a este topic específico — sin esto, el
# bucket sería accesible por cualquier SNS topic de la cuenta.
data "aws_iam_policy_document" "sqs_allow_sns" {
  statement {
    sid    = "AllowSNSPublishToQueue"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["sns.amazonaws.com"]
    }

    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.ticket_notifications.arn]

    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [aws_sns_topic.ticket_events.arn]
    }
  }
}

resource "aws_sqs_queue_policy" "ticket_notifications" {
  queue_url = aws_sqs_queue.ticket_notifications.id
  policy    = data.aws_iam_policy_document.sqs_allow_sns.json
}
