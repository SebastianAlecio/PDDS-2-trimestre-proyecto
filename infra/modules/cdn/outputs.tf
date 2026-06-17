output "bucket_name" {
  description = "Nombre del bucket S3 que hostea el frontend. Consumido por el workflow frontend-deploy.yml (aws s3 sync $${path} s3://$${bucket_name}/)."
  value       = aws_s3_bucket.frontend.bucket
}

output "bucket_arn" {
  description = "ARN del bucket S3 frontend."
  value       = aws_s3_bucket.frontend.arn
}

output "distribution_id" {
  description = "ID de la CloudFront distribution. Consumido por el workflow para hacer create-invalidation post-deploy."
  value       = aws_cloudfront_distribution.frontend.id
}

output "distribution_arn" {
  description = "ARN de la CloudFront distribution. Referenciado por el bucket policy (AWS:SourceArn condition)."
  value       = aws_cloudfront_distribution.frontend.arn
}

output "distribution_domain_name" {
  description = "Dominio assignado por CloudFront (ej. d3abc.cloudfront.net). El A-alias de Route 53 apunta a este endpoint."
  value       = aws_cloudfront_distribution.frontend.domain_name
}

output "frontend_url" {
  description = "URL pública del frontend (https://$${full_hostname}). Para uso humano y para el smoke test post-deploy."
  value       = "https://${var.full_hostname}"
}
