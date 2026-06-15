output "api_id" {
  description = "ID del WebSocket API."
  value       = aws_apigatewayv2_api.ws.id
}

output "api_execution_arn" {
  description = "Execution ARN base. La policy ManageConnections lo usa con sufijo /*/POST/@connections/*."
  value       = aws_apigatewayv2_api.ws.execution_arn
}

output "default_endpoint" {
  description = "URL execute-api default del stage (formato wss://<id>.execute-api.<region>.amazonaws.com/<stage>). Útil para debug con wscat."
  value       = "${aws_apigatewayv2_api.ws.api_endpoint}/${aws_apigatewayv2_stage.chat.name}"
}

output "custom_domain_endpoint" {
  description = "URL wss del custom domain (vacío si enable_custom_domain = false). Lo consume el frontend como VITE_WS_ENDPOINT."
  value       = var.enable_custom_domain ? "wss://${var.domain_name}" : ""
}

output "management_endpoint" {
  description = "URL https del management endpoint que usa @aws-sdk/client-apigatewaymanagementapi para PostToConnection. Formato: https://<id>.execute-api.<region>.amazonaws.com/<stage>. Derivado del api_endpoint + var.stage_name (no del stage.invoke_url) para evitar un ciclo: el stage depende transitivamente de la integration → Lambda chat_ws, y chat_ws consume este output como env var."
  value       = "${replace(aws_apigatewayv2_api.ws.api_endpoint, "wss://", "https://")}/${var.stage_name}"
}

output "regional_domain_name" {
  description = "Hostname al que apunta el A-alias en Route 53 (vacío si no hay custom domain)."
  value       = var.enable_custom_domain ? aws_apigatewayv2_domain_name.ws[0].domain_name_configuration[0].target_domain_name : ""
}

output "regional_zone_id" {
  description = "Hosted zone ID del custom domain (vacío si no hay custom domain). Para el bloque alias del aws_route53_record."
  value       = var.enable_custom_domain ? aws_apigatewayv2_domain_name.ws[0].domain_name_configuration[0].hosted_zone_id : ""
}
