output "compute_function_arn" {
  description = "ARN of the Lambda function provisioned by the compute module."
  value       = module.compute.function_arn
}

output "compute_function_name" {
  description = "Fully qualified name of the Lambda function."
  value       = module.compute.function_name
}

output "attachments_bucket_name" {
  description = "Name of the attachments bucket provisioned by the storage module."
  value       = module.storage.bucket_name
}

output "attachments_bucket_arn" {
  description = "ARN of the attachments bucket. Consumed by IAM policies in later deliveries."
  value       = module.storage.bucket_arn
}

output "db_endpoint" {
  description = "Connection endpoint of the RDS instance in the form \"host:port\"."
  value       = module.database.db_endpoint
  sensitive   = true
}

output "db_arn" {
  description = "ARN of the RDS instance."
  value       = module.database.db_arn
}

output "app_tier_security_group_id" {
  description = "ID of the placeholder app tier security group. Future Lambda VPC configurations attach to this SG to reach the database."
  value       = aws_security_group.app_tier.id
}
