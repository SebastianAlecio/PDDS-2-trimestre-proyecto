output "queue_url" {
  description = "URL de la cola principal (formato https://sqs.<region>.amazonaws.com/<account>/<name>). Se inyecta como env var QUEUE_URL al producer (POST /enqueue) y al consumer (cuando corre como worker no-event-source). Para AWS CLI: aws sqs send-message --queue-url <output>."
  value       = aws_sqs_queue.main.url
}

output "queue_arn" {
  description = "ARN de la cola principal. Se consume desde la IAM policy del producer (sqs:SendMessage), desde el event_source_mapping del consumer Lambda (event_source_arn) y desde la IAM policy del consumer (sqs:ReceiveMessage/DeleteMessage/GetQueueAttributes). Scoped al ARN exacto — sin wildcards."
  value       = aws_sqs_queue.main.arn
}

output "queue_name" {
  description = "Nombre canónico de la cola principal (sin region/account). Útil para queries de CloudWatch metrics (Namespace AWS/SQS, dimension QueueName)."
  value       = aws_sqs_queue.main.name
}

output "dlq_url" {
  description = "URL de la Dead Letter Queue. Para inspección manual (consola SQS o `aws sqs receive-message --queue-url <output>`) cuando un mensaje cayó tras max_receive_count fallos."
  value       = aws_sqs_queue.dlq.url
}

output "dlq_arn" {
  description = "ARN de la DLQ. Útil para crear CloudWatch alarms sobre ApproximateNumberOfMessagesVisible (alertan cuando hay mensajes stuck — indicación de bug en el consumer)."
  value       = aws_sqs_queue.dlq.arn
}

output "dlq_name" {
  description = "Nombre canónico de la DLQ (sin region/account). Para queries de CloudWatch metrics."
  value       = aws_sqs_queue.dlq.name
}
