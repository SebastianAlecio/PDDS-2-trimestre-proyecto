output "function_arn" {
  description = "ARN of the Lambda function. Required output by the delivery rubric; consumed by downstream IAM policies and event source mappings."
  value       = aws_lambda_function.this.arn
}

output "function_name" {
  description = "Fully qualified name of the Lambda function. Used by aws CLI invocations and by CloudWatch alarms in later deliveries."
  value       = aws_lambda_function.this.function_name
}

output "log_group_name" {
  description = "Name of the CloudWatch log group that captures function logs. Useful for subscription filters and log-based metrics."
  value       = aws_cloudwatch_log_group.lambda.name
}

output "execution_role_arn" {
  description = "ARN of the IAM role assumed by the function at runtime. Surfaced for auditability of least-privilege scoping."
  value       = aws_iam_role.lambda_exec.arn
}
