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

output "tickets_table_name" {
  description = "Name of the DynamoDB tickets table."
  value       = module.database.table_name
}

output "tickets_table_arn" {
  description = "ARN of the DynamoDB tickets table. Consumed by IAM policies that scope Lambda access in later deliveries."
  value       = module.database.table_arn
}
