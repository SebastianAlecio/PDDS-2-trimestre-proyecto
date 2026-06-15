locals {
  main_queue_name = "${var.queue_name_prefix}-${var.environment}"
  dlq_name        = "${var.queue_name_prefix}-${var.environment}-dlq"
}

# ─── DLQ ────────────────────────────────────────────────────────────────────
# Cola de Dead Letter — recibe mensajes que la cola principal no pudo
# entregar exitosamente después de max_receive_count intentos. Sin
# suscriptores: la inspección es manual (CloudWatch metric
# ApproximateNumberOfMessagesVisible + consola SQS). Retención larga porque
# es para análisis post-incidente, no tráfico vivo.
resource "aws_sqs_queue" "dlq" {
  name                       = local.dlq_name
  message_retention_seconds  = var.dlq_message_retention_seconds
  visibility_timeout_seconds = var.visibility_timeout_seconds

  tags = {
    Environment = var.environment
    Role        = "dead-letter"
  }
}

# ─── Cola principal ─────────────────────────────────────────────────────────
# El redrive_policy enlaza esta cola con la DLQ — cuando un mensaje recibe
# más de max_receive_count entregas sin DeleteMessage, SQS lo mueve
# automáticamente a la DLQ. Sin redrive_policy, los mensajes problemáticos
# se reciclarían infinitamente o se descartarían silenciosamente al
# vencer message_retention_seconds (pitfall named del rubric).
resource "aws_sqs_queue" "main" {
  name                       = local.main_queue_name
  message_retention_seconds  = var.message_retention_seconds
  visibility_timeout_seconds = var.visibility_timeout_seconds

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = var.max_receive_count
  })

  tags = {
    Environment = var.environment
    Role        = "main"
  }
}
