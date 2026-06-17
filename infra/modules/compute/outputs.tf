output "function_arn" {
  description = "ARN of the Lambda function. Consumed by downstream IAM policies (en módulo iam/) y event source mappings."
  value       = aws_lambda_function.this.arn
}

output "function_name" {
  description = "Fully qualified name of the Lambda function (\"$${name}-$${environment}\"). Used by aws CLI invocations y por las alarmas de CloudWatch del módulo observability/."
  value       = aws_lambda_function.this.function_name
}

output "log_group_name" {
  description = "Name of the CloudWatch log group que captura los logs de la función. Útil para subscription filters y log-based metrics."
  value       = aws_cloudwatch_log_group.lambda.name
}

output "log_group_arn" {
  description = "ARN of the CloudWatch log group. Surfaced para que módulos consumers (ej. observability) puedan crear alarmas y filtros."
  value       = aws_cloudwatch_log_group.lambda.arn
}
