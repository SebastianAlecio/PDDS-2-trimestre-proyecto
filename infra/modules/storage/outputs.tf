output "bucket_arn" {
  description = "ARN of the bucket. Required output by the delivery rubric; consumed by IAM policies attached to readers/writers."
  value       = aws_s3_bucket.this.arn
}

output "bucket_name" {
  description = "Globally-unique bucket name. Used by the application layer and by aws CLI verifications."
  value       = aws_s3_bucket.this.bucket
}

output "bucket_regional_domain_name" {
  description = "Region-specific S3 endpoint for the bucket. Useful for explicit endpoint configuration and pre-signed URL generation."
  value       = aws_s3_bucket.this.bucket_regional_domain_name
}
