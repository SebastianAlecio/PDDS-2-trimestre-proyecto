output "tickets_lambda_role_arn" {
  description = "ARN del role del tickets Lambda. Consumido por module.compute (tickets instance) como execution_role_arn."
  value       = aws_iam_role.tickets_lambda.arn
}

output "chat_ws_lambda_role_arn" {
  description = "ARN del role del chat-ws Lambda. Consumido por module.chat_ws como execution_role_arn."
  value       = aws_iam_role.chat_ws_lambda.arn
}

output "notifier_lambda_role_arn" {
  description = "ARN del role del notifier Lambda. Consumido por module.notifier como execution_role_arn."
  value       = aws_iam_role.notifier_lambda.arn
}

output "async_consumer_lambda_role_arn" {
  description = "ARN del role del async_consumer Lambda. Consumido por module.async_consumer como execution_role_arn."
  value       = aws_iam_role.async_consumer_lambda.arn
}

output "watchdog_lambda_role_arn" {
  description = "ARN del role del watchdog Lambda. Consumido por module.watchdog como execution_role_arn."
  value       = aws_iam_role.watchdog_lambda.arn
}

output "scheduler_invoke_role_arn" {
  description = "ARN del role asumido por EventBridge Scheduler para invocar el watchdog. Consumido por module.watchdog como scheduler_role_arn."
  value       = aws_iam_role.scheduler_invoke.arn
}

# ─── OIDC outputs (poblados en Task 3 cuando enable_oidc = true) ─────────

output "ci_runner_role_arn" {
  description = "ARN del role assumable via OIDC desde GitHub Actions. Vacío si enable_oidc = false."
  value       = var.enable_oidc ? aws_iam_role.ci_runner[0].arn : ""
}

output "github_oidc_provider_arn" {
  description = "ARN del aws_iam_openid_connect_provider de GitHub Actions. Vacío si enable_oidc = false."
  value       = var.enable_oidc ? aws_iam_openid_connect_provider.github[0].arn : ""
}

# ─── Lista consolidada de role ARNs (consumida por el módulo KMS Task 2) ─
# La key policy del KMS CMK necesita listar todos los roles que tengan
# permitido kms:Decrypt vía S3/DDB. Exponer la lista evita que el wiring
# en main.tf tenga que enumerar role-por-role.

output "all_lambda_role_arns" {
  description = "Lista de ARNs de TODOS los roles de Lambda. Consumida por module.kms como consumer_role_arns para construir la key policy."
  value = [
    aws_iam_role.tickets_lambda.arn,
    aws_iam_role.chat_ws_lambda.arn,
    aws_iam_role.notifier_lambda.arn,
    aws_iam_role.async_consumer_lambda.arn,
    aws_iam_role.watchdog_lambda.arn,
  ]
}
