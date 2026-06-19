# IaC Coverage — OYD-D5 Deliverable I

Este documento prueba que **todo recurso AWS del stack Ticke-T está gestionado por Terraform**, sin recursos creados manualmente que existan fuera del state.

- Evidencia: `infra/evidence/state-list.txt` (output completo de `terraform state list`, 237 recursos).
- Screenshot de la consola: `infra/evidence/deployed-components.png` (Lambda Functions filtradas mostrando las 5 Lambdas Active).

## Mapping table — Componente → IaC

| Application Component | Cloud Service Used | Terraform Resource Type | Module Path |
|---|---|---|---|
| **Compute** ||||
| Tickets REST handler | AWS Lambda | `aws_lambda_function` | `module.compute` |
| Chat WebSocket handler | AWS Lambda | `aws_lambda_function` | `module.chat_ws` |
| Notifier email worker | AWS Lambda | `aws_lambda_function` | `module.notifier` |
| Async consumer (audit + SES) | AWS Lambda | `aws_lambda_function` | `module.async_consumer` |
| Watchdog scheduler | AWS Lambda | `aws_lambda_function` | `module.watchdog` |
| EventBridge Scheduler (watchdog cron) | EventBridge Scheduler v2 | `aws_scheduler_schedule` | `module.watchdog` |
| Notifier event source mapping | Lambda Event Source Mapping | `aws_lambda_event_source_mapping` | `module.notifier` |
| Async consumer event source mapping | Lambda Event Source Mapping | `aws_lambda_event_source_mapping` | `module.async_consumer` |
| **Database** ||||
| Tickets single-table store | DynamoDB | `aws_dynamodb_table` | `module.database` |
| **Storage** ||||
| Attachments + async events bucket | S3 (KMS-encrypted via D5) | `aws_s3_bucket` + `aws_s3_bucket_*_configuration` | `module.storage` |
| Frontend SPA bucket | S3 (privado, OAC) | `aws_s3_bucket` + policy | `module.cdn` |
| **Networking / Ingress** ||||
| REST API | API Gateway REST regional | `aws_api_gateway_rest_api` + methods + integrations + stage | `module.api` |
| WebSocket API | API Gateway v2 | `aws_apigatewayv2_api` + routes + integrations + stage | `module.realtime` |
| CloudFront distribution (frontend TLS + redirect 301) | CloudFront | `aws_cloudfront_distribution` + `aws_cloudfront_origin_access_control` | `module.cdn` |
| WAF Web ACL | WAFv2 | `aws_wafv2_web_acl` + `aws_wafv2_web_acl_association` | `module.waf` |
| Hosted zone | Route 53 | `aws_route53_zone` + 13 `aws_route53_record` | `module.dns` |
| ACM wildcard cert (reused for CloudFront via data source) | ACM | `aws_acm_certificate` + `aws_acm_certificate_validation` | `module.dns` |
| API Gateway custom domain | API Gateway | `aws_api_gateway_domain_name` + `aws_api_gateway_base_path_mapping` | `module.dns` |
| WS API custom domain | API Gateway v2 | `aws_apigatewayv2_domain_name` + `aws_apigatewayv2_api_mapping` | `module.realtime` |
| **Async messaging** ||||
| Ticket notifications SNS topic | SNS | `aws_sns_topic` + subscription | `module.notifications` |
| Ticket notifications SQS queue | SQS | `aws_sqs_queue.ticket_notifications` | `module.notifications` |
| Ticket notifications DLQ | SQS | `aws_sqs_queue.dlq` + `aws_sqs_queue_policy` | `module.notifications` |
| Async events SQS queue | SQS | `aws_sqs_queue.main` | `module.async` |
| Async events DLQ | SQS | `aws_sqs_queue.dlq` (redrive_policy) | `module.async` |
| **Security / IAM** ||||
| KMS CMK (encrypts S3 + DDB) | KMS | `aws_kms_key` + `aws_kms_alias` | `module.kms` |
| Tickets Lambda execution role | IAM | `aws_iam_role` + 7 `aws_iam_role_policy` | `module.iam` |
| Chat-WS Lambda execution role | IAM | `aws_iam_role` + 4 `aws_iam_role_policy` | `module.iam` |
| Notifier Lambda execution role | IAM | `aws_iam_role` + 4 `aws_iam_role_policy` | `module.iam` |
| Async consumer execution role | IAM | `aws_iam_role` + 4 `aws_iam_role_policy` | `module.iam` |
| Watchdog Lambda execution role | IAM | `aws_iam_role` + 3 `aws_iam_role_policy` | `module.iam` |
| EventBridge Scheduler invoker role | IAM | `aws_iam_role` + `aws_iam_role_policy` | `module.iam` |
| CI runner role (OIDC) | IAM | `aws_iam_role` + `aws_iam_role_policy_attachment` (AdministratorAccess) | `module.iam` |
| GitHub Actions OIDC provider | IAM | `aws_iam_openid_connect_provider` | `module.iam` |
| Cognito User Pool | Cognito | `aws_cognito_user_pool` + 4 `aws_cognito_user_group` + client | `module.security` |
| **Observability** ||||
| Lambda log groups (5) | CloudWatch Logs | `aws_cloudwatch_log_group` (1 por instance del módulo compute) | `module.compute` (x5) |
| API Gateway access log group | CloudWatch Logs | `aws_cloudwatch_log_group` | `module.observability` |
| SNS alarms topic + email subscription | SNS | `aws_sns_topic` + `aws_sns_topic_subscription` + `aws_sns_topic_policy` | `module.observability` |
| Lambda Errors metric alarms (5) | CloudWatch Alarms | `aws_cloudwatch_metric_alarm` (for_each por función) | `module.observability` |
| SQS DLQ depth metric alarms (2) | CloudWatch Alarms | `aws_cloudwatch_metric_alarm` (for_each por DLQ) | `module.observability` |
| API Gateway 5XX alarm | CloudWatch Alarms | `aws_cloudwatch_metric_alarm` | `module.observability` |
| CloudWatch Dashboard | CloudWatch | `aws_cloudwatch_dashboard` (body via jsonencode) | `module.observability` |
| AWS Budget mensual | AWS Budgets | `aws_budgets_budget` | `module.observability` |
| **SES (email transactional)** ||||
| SES Domain identity (lumenchat.app) | SES | `aws_ses_domain_identity` + `aws_ses_domain_dkim` + verification record | `module.dns` |

## Confirmación de no-manual

**Ningún recurso del stack fue creado manualmente desde la consola de AWS.** Todos los recursos visibles en la consola tienen su entrada correspondiente en `terraform state list` (ver `infra/evidence/state-list.txt`).

Excepciones operacionales documentadas (no son recursos manuales, son acciones de mantenimiento):

- **Subscription al SNS topic de alarmas**: El recurso `aws_sns_topic_subscription` está provisionado por Terraform (`module.observability.aws_sns_topic_subscription.email`), pero la confirmación del email (click al link "Confirm subscription") es una acción manual obligatoria del subscriber — AWS no permite confirmarla via API/TF. Sin la confirmación, la subscription queda en estado `PendingConfirmation` y el subscriber no recibe las notificaciones.
- **Cuentas Cognito de usuarios reales**: los usuarios (colaboradores, agentes) se crean via el endpoint `POST /users` del API (handler Lambda) o via `aws cognito-idp admin-create-user` durante setup. NO son recursos de TF — son contenido del User Pool, no infra.
- **Objetos S3 (attachments + async-events + frontend assets)**: contenido subido por la app (attachments) o por el workflow `frontend-deploy.yml` (bundles del frontend). NO son recursos TF — son contenido del bucket.

## Comandos para verificar la coverage

```bash
cd infra

# 1) Listar todos los recursos en state
terraform state list

# 2) Comparar con la realidad — ejemplo Lambdas
aws lambda list-functions \
  --query 'Functions[?contains(FunctionName, `dev`) || contains(FunctionName, `chat-`)].FunctionName'

# 3) DynamoDB
aws dynamodb list-tables --query 'TableNames[?contains(@, `dev`)]'

# 4) S3 buckets
aws s3api list-buckets --query 'Buckets[?starts_with(Name, `pdds-oyd`)].Name'

# 5) IAM roles del proyecto
aws iam list-roles --query 'Roles[?starts_with(RoleName, `pdds-oyd`)].RoleName'

# 6) Plan idempotency check — exit code 0 confirma cero drift
terraform plan -detailed-exitcode -var-file=envs/dev/dev.tfvars
echo $?    # Esperado: 0
```
