output "user_pool_id" {
  description = "ID del User Pool de Cognito."
  value       = aws_cognito_user_pool.pool.id
}

output "user_pool_arn" {
  description = "ARN del User Pool de Cognito. Consumido por el authorizer JWT de API Gateway."
  value       = aws_cognito_user_pool.pool.arn
}

output "user_pool_endpoint" {
  description = "Endpoint del User Pool sin protocolo. El issuer JWT se construye anteponiendo 'https://' a este valor."
  value       = aws_cognito_user_pool.pool.endpoint
}

output "user_pool_client_id" {
  description = "ID del User Pool Client. Necesario para inicializar el SDK en el frontend (Amplify Auth)."
  value       = aws_cognito_user_pool_client.client.id
}

output "user_group_names" {
  description = "Nombres de los grupos creados en el User Pool. Útil para documentación y para validar que el frontend conoce los mismos identificadores."
  value = [
    aws_cognito_user_group.colaborador.name,
    aws_cognito_user_group.agente_n1.name,
    aws_cognito_user_group.agente_n2.name,
    aws_cognito_user_group.gerente.name,
  ]
}
