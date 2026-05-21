output "state_bucket_name" {
  description = "Name of the S3 bucket that stores Terraform state for the main workspace. Hardcode this value into infra/backend.tf."
  value       = aws_s3_bucket.tfstate.bucket
}

output "lock_table_name" {
  description = "Name of the DynamoDB table used for state locking by the S3 backend."
  value       = aws_dynamodb_table.tflock.name
}

output "region" {
  description = "AWS region where the state bucket and lock table live. Must match the region declared in the backend block."
  value       = var.region
}
