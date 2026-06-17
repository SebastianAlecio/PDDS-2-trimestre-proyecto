output "key_id" {
  description = "ID corto de la CMK (UUID). Usado en S3 server_side_encryption.kms_master_key_id."
  value       = aws_kms_key.this.key_id
}

output "key_arn" {
  description = "ARN completo de la CMK. Usado en DynamoDB server_side_encryption.kms_key_arn y como referencia auditable en outputs."
  value       = aws_kms_key.this.arn
}

output "alias_name" {
  description = "Nombre del alias de la CMK (ej. alias/pdds-oyd-dev). Útil para consultas con aws kms describe-key --key-id alias/..."
  value       = aws_kms_alias.this.name
}

output "alias_arn" {
  description = "ARN del alias de la CMK."
  value       = aws_kms_alias.this.arn
}
