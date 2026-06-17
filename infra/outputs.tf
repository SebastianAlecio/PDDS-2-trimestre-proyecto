output "compute_function_arn" {
  description = "ARN of the Lambda function provisioned by the compute module."
  value       = module.compute.function_arn
}

output "compute_function_name" {
  description = "Fully qualified name of the Lambda function."
  value       = module.compute.function_name
}

output "watchdog_function_arn" {
  description = "ARN de la función Lambda del watchdog"
  value       = module.watchdog.function_arn
}

output "watchdog_function_name" {
  description = "Nombre de la función Lambda del watchdog"
  value       = module.watchdog.function_name
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

output "ws_default_endpoint" {
  description = "URL wss del WebSocket API en el endpoint execute-api default. Útil para debug con wscat antes de propagar el custom domain."
  value       = module.realtime.default_endpoint
}

output "ws_custom_domain_endpoint" {
  description = "URL wss del WebSocket custom domain (ej. wss://ws.ticke-t.lumenchat.app). Vacío hasta que dns_enable_ws_custom_domain = true y el A-alias propague."
  value       = module.realtime.custom_domain_endpoint
}

output "ws_management_endpoint" {
  description = "Endpoint https para PostToConnection (lo consume @aws-sdk/client-apigatewaymanagementapi). Inyectado a las Lambdas chat-ws y tickets como env var WEBSOCKET_API_ENDPOINT."
  value       = module.realtime.management_endpoint
}

# ─── Async messaging outputs (OYD-D4 Deliverable A evidence) ─────────────
# Estos outputs los va a leer `terraform output` para generar
# infra/evidence/async-foundation.txt (requisito del rubric).

output "async_queue_url" {
  description = "URL de la cola principal del módulo async/. Útil para AWS CLI: aws sqs send-message --queue-url <output>."
  value       = module.async.queue_url
}

output "async_queue_arn" {
  description = "ARN de la cola principal del módulo async/. Scope de las IAM policies del producer y consumer."
  value       = module.async.queue_arn
}

output "async_queue_name" {
  description = "Nombre canónico de la cola principal del módulo async/ (sin region/account)."
  value       = module.async.queue_name
}

output "async_dlq_url" {
  description = "URL de la DLQ del módulo async/. Para inspección manual de mensajes que cayeron tras max_receive_count fallos."
  value       = module.async.dlq_url
}

output "async_dlq_arn" {
  description = "ARN de la DLQ del módulo async/. Para CloudWatch alarms sobre ApproximateNumberOfMessagesVisible."
  value       = module.async.dlq_arn
}

output "async_dlq_name" {
  description = "Nombre canónico de la DLQ del módulo async/ (sin region/account)."
  value       = module.async.dlq_name
}

output "async_consumer_function_name" {
  description = "Nombre de la Lambda consumer del módulo async_consumer. Útil para AWS CLI: aws logs tail /aws/lambda/<output>."
  value       = module.async_consumer.function_name
}

output "async_consumer_function_arn" {
  description = "ARN de la Lambda consumer del módulo async_consumer. Se inyecta como target del aws_lambda_event_source_mapping."
  value       = module.async_consumer.function_arn
}

# ─── Security outputs (OYD-D5) ────────────────────────────────────────────

output "kms_key_id" {
  description = "ID corto de la CMK que encripta S3 + DynamoDB (D5 Deliverable B)."
  value       = module.kms.key_id
}

output "kms_key_arn" {
  description = "ARN de la CMK. Referenciado en aws_s3_bucket_server_side_encryption_configuration y en aws_dynamodb_table.server_side_encryption."
  value       = module.kms.key_arn
}

output "kms_alias_name" {
  description = "Alias amigable de la CMK (ej. alias/pdds-oyd-dev). Útil para queries con AWS CLI: aws kms describe-key --key-id alias/..."
  value       = module.kms.alias_name
}

# ─── IAM role outputs (OYD-D5 Deliverable A — exposed for auditability) ──

output "iam_tickets_lambda_role_arn" {
  description = "ARN del execution role del tickets Lambda. Consumido por module.compute como execution_role_arn."
  value       = module.iam.tickets_lambda_role_arn
}

output "iam_chat_ws_lambda_role_arn" {
  description = "ARN del execution role del chat-ws Lambda."
  value       = module.iam.chat_ws_lambda_role_arn
}

output "iam_notifier_lambda_role_arn" {
  description = "ARN del execution role del notifier Lambda."
  value       = module.iam.notifier_lambda_role_arn
}

output "iam_async_consumer_lambda_role_arn" {
  description = "ARN del execution role del async_consumer Lambda."
  value       = module.iam.async_consumer_lambda_role_arn
}

output "iam_watchdog_lambda_role_arn" {
  description = "ARN del execution role del watchdog Lambda."
  value       = module.iam.watchdog_lambda_role_arn
}

output "iam_scheduler_invoke_role_arn" {
  description = "ARN del role asumido por EventBridge Scheduler para invocar el watchdog."
  value       = module.iam.scheduler_invoke_role_arn
}

output "iam_ci_runner_role_arn" {
  description = "ARN del role assumable via OIDC desde GitHub Actions. Vacío hasta que enable_github_oidc = true (Task 3)."
  value       = module.iam.ci_runner_role_arn
}

output "iam_github_oidc_provider_arn" {
  description = "ARN del provider OIDC de GitHub Actions. Vacío hasta que enable_github_oidc = true (Task 3)."
  value       = module.iam.github_oidc_provider_arn
}

# ─── CDN outputs (OYD-D5 Deliverable D) ────────────────────────────────

output "frontend_bucket_name" {
  description = "Nombre del bucket S3 que hostea el frontend. Consumido por el workflow frontend-deploy.yml para aws s3 sync."
  value       = length(module.cdn) > 0 ? module.cdn[0].bucket_name : ""
}

output "frontend_distribution_id" {
  description = "ID de la CloudFront distribution. Consumido por el workflow para create-invalidation post-deploy."
  value       = length(module.cdn) > 0 ? module.cdn[0].distribution_id : ""
}

output "frontend_distribution_domain_name" {
  description = "Dominio CloudFront (ej. d3abc.cloudfront.net). Para debug; usuarios usan frontend_url."
  value       = length(module.cdn) > 0 ? module.cdn[0].distribution_domain_name : ""
}

output "frontend_url" {
  description = "URL pública del frontend (https://app.ticke-t.lumenchat.app). Endpoint final para usuarios."
  value       = length(module.cdn) > 0 ? module.cdn[0].frontend_url : ""
}
