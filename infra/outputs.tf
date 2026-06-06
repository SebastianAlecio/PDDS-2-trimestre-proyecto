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

output "cognito_user_pool_id" {
  description = "ID del User Pool de Cognito. Se inyecta al frontend (VITE_COGNITO_USER_POOL_ID) y al authorizer JWT de API Gateway."
  value       = module.security.user_pool_id
}

output "cognito_user_pool_arn" {
  description = "ARN del User Pool de Cognito. Consumido por el authorizer JWT de API Gateway."
  value       = module.security.user_pool_arn
}

output "cognito_user_pool_client_id" {
  description = "ID del User Pool Client. Se inyecta al frontend (VITE_COGNITO_USER_POOL_CLIENT_ID)."
  value       = module.security.user_pool_client_id
}

output "cognito_user_pool_endpoint" {
  description = "Endpoint del User Pool sin protocolo (ej: cognito-idp.us-east-1.amazonaws.com/us-east-1_XXX). El issuer JWT del authorizer se construye anteponiendo 'https://' a este valor."
  value       = module.security.user_pool_endpoint
}

output "cognito_region" {
  description = "Región de AWS donde vive el User Pool. Se inyecta al frontend (VITE_COGNITO_REGION) para Amplify Auth."
  value       = var.region
}

output "cognito_user_group_names" {
  description = "Nombres canónicos de los 4 roles del sistema. El frontend debe usar exactamente estos identificadores para los guards por rol."
  value       = module.security.user_group_names
}

output "api_endpoint" {
  description = "URL base del HTTP API (sin path). Se inyecta al frontend como VITE_API_BASE_URL. Ej: https://abc123.execute-api.us-east-1.amazonaws.com."
  value       = module.api.api_endpoint
}

output "api_id" {
  description = "ID del REST API. Útil para queries con AWS CLI."
  value       = module.api.api_id
}

output "waf_web_acl_arn" {
  description = "ARN del Web ACL de WAF asociado al stage del REST API."
  value       = module.waf.web_acl_arn
}

output "dns_zone_nameservers" {
  description = "Los 4 nameservers de la hosted zone delegada en Route 53. PEGAR en el panel de DNS del dominio padre (Hostinger) como records NS para el subdominio. Vacío si dns_subdomain no está configurado."
  value       = length(module.dns) > 0 ? module.dns[0].zone_nameservers : []
}

output "dns_api_url" {
  description = "URL pública del API en el custom domain (ej. https://api.ticke-t.lumenchat.app). Vacío hasta que dns_enable_api_custom_domain = true y el segundo apply pase."
  value       = length(module.dns) > 0 ? module.dns[0].api_url : ""
}

# Re-exportados del módulo dns con los nombres exigidos por el rubric OYD-D3.
output "domain_name" {
  description = "FQDN del custom domain del API (rubric OYD-D3: \"Outputs: domain_name and hosted_zone_id\")."
  value       = length(module.dns) > 0 ? module.dns[0].domain_name : ""
}

output "hosted_zone_id" {
  description = "ID de la hosted zone Route 53 (rubric OYD-D3: \"Outputs: domain_name and hosted_zone_id\")."
  value       = length(module.dns) > 0 ? module.dns[0].hosted_zone_id : ""
}
