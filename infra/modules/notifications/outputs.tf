output "sns_topic_arn" {
  description = "ARN del SNS topic ticket-events. Lo consume la tickets Lambda como env var SNS_TOPIC_ARN y como Resource de su IAM policy de sns:Publish."
  value       = aws_sns_topic.ticket_events.arn
}

output "sns_topic_name" {
  description = "Nombre canónico del topic (sin region/account). Útil para queries con AWS CLI."
  value       = aws_sns_topic.ticket_events.name
}

output "sqs_queue_arn" {
  description = "ARN de la cola principal. Lo consume el event source mapping del notifier Lambda y su IAM policy de sqs:ReceiveMessage/DeleteMessage."
  value       = aws_sqs_queue.ticket_notifications.arn
}

output "sqs_queue_url" {
  description = "URL de la cola principal (formato https://sqs.region.amazonaws.com/account/name). Útil para queries y debug con AWS CLI."
  value       = aws_sqs_queue.ticket_notifications.url
}

output "dlq_arn" {
  description = "ARN de la Dead Letter Queue. Para alarmas de CloudWatch sobre messages stuck en la DLQ (no implementado en esta entrega)."
  value       = aws_sqs_queue.dlq.arn
}

output "dlq_url" {
  description = "URL de la DLQ. Para inspección manual desde la consola SQS o `aws sqs receive-message`."
  value       = aws_sqs_queue.dlq.url
}
