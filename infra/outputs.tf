output "bootstrap_bucket_name" {
  description = "Globally-unique name of the bootstrap S3 bucket. Consumed by downstream pipeline steps and child modules."
  value       = aws_s3_bucket.bootstrap.bucket
}

output "bootstrap_bucket_arn" {
  description = "ARN of the bootstrap S3 bucket. Used by IAM policies attached in later deliveries."
  value       = aws_s3_bucket.bootstrap.arn
}
