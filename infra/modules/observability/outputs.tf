output "sns_topic_arn" {
  description = "ARN del SNS topic de alarmas. Útil para suscribir otros consumers (PagerDuty, Slack, etc.) en el futuro."
  value       = aws_sns_topic.alarms.arn
}

output "sns_topic_name" {
  description = "Nombre del SNS topic de alarmas."
  value       = aws_sns_topic.alarms.name
}

output "api_access_log_group_name" {
  description = "Nombre del log group del API Gateway access log. Si en el futuro se conecta el stage al log group via aws_api_gateway_stage.access_log_settings, este es el target."
  value       = aws_cloudwatch_log_group.api_gateway_access.name
}

output "api_access_log_group_arn" {
  description = "ARN del log group del API Gateway access log."
  value       = aws_cloudwatch_log_group.api_gateway_access.arn
}

output "lambda_error_alarm_arns" {
  description = "Lista de ARNs de las metric alarms de Lambda Errors (1 por funcion)."
  value       = [for a in aws_cloudwatch_metric_alarm.lambda_errors : a.arn]
}

output "dlq_depth_alarm_arns" {
  description = "Lista de ARNs de las metric alarms de SQS DLQ depth (1 por DLQ)."
  value       = [for a in aws_cloudwatch_metric_alarm.sqs_dlq_depth : a.arn]
}

output "api_5xx_alarm_arn" {
  description = "ARN de la metric alarm del API Gateway 5XXError."
  value       = aws_cloudwatch_metric_alarm.api_gateway_5xx.arn
}

output "dashboard_arn" {
  description = "ARN del CloudWatch dashboard. La URL humana es https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=$${name}."
  value       = aws_cloudwatch_dashboard.main.dashboard_arn
}

output "dashboard_name" {
  description = "Nombre del CloudWatch dashboard (ej. pdds-oyd-dev-main)."
  value       = aws_cloudwatch_dashboard.main.dashboard_name
}

output "budget_id" {
  description = "ID del AWS Budget mensual."
  value       = aws_budgets_budget.monthly.id
}
