environment                    = "dev"
project_name                   = "pdds-oyd"
region                         = "us-east-1"
attachments_bucket_name_prefix = "pdds-oyd-attachments"
compute_function_name          = "chat-message-handler"
compute_memory_size            = 128
tickets_table_name             = "tickets"
db_billing_mode                = "PAY_PER_REQUEST"
api_health_check_path          = "/health"

# DNS administrado por Route 53. Apply 1 crea la hosted zone del dominio
# entero (lumenchat.app) con todos los records de la zona; nos da 4 NS que
# se configuran como Custom Nameservers en el registrador del dominio.
# Apply 2 (después de propagación) sube enable_api_custom_domain a true y
# crea el cert ACM + custom domain del API + A-alias para api.ticke-t.lumenchat.app.
dns_parent_domain              = "lumenchat.app"
dns_api_full_hostname          = "api.ticke-t.lumenchat.app"
dns_enable_api_custom_domain   = true
dns_enable_ses_domain_identity = true

# Notificaciones por email vía SES. La From es la dirección remitente; el
# dominio se verifica via el módulo dns (DKIM + TXT) cuando
# dns_enable_ses_domain_identity = true. Mientras la cuenta SES esté en
# sandbox, los recipients tienen que estar verificados individualmente.
ses_from_address = "soporte@lumenchat.app"

# WebSocket custom domain. Apply 1 crea el WS API en wss://<api-id>.execute-api...
# Apply 2 sube enable_ws_custom_domain a true y crea wss://ws.ticke-t.lumenchat.app
# (reusa el cert wildcard de dns).
dns_ws_full_hostname        = "ws.ticke-t.lumenchat.app"
dns_enable_ws_custom_domain = true

# ─── OIDC federation con GitHub Actions (OYD-D5 Deliverable C) ────────────
# Provisiona el OIDC provider de GitHub Actions + ci_runner role assumable
# vía sts:AssumeRoleWithWebIdentity. Reemplaza las access keys long-lived
# (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY) que se borran de GH Secrets
# despues de validar que los workflows funcionan con OIDC.
enable_github_oidc = true
github_owner       = "SebastianAlecio"
github_repo        = "PDDS-2-trimestre-proyecto"

# ─── Frontend CDN (OYD-D5 Deliverable D) ──────────────────────────────────
# CloudFront + S3 privado sirviendo el frontend Vite buildeado bajo
# app.ticke-t.lumenchat.app. Reusa el cert wildcard de D3.
enable_frontend_cdn    = true
frontend_full_hostname = "app.ticke-t.lumenchat.app"

# ─── Observability (OYD-D5 Deliverable E) ──────────────────────────────────
notification_email = "sebastianalecio@gmail.com"
monthly_budget_usd = 20
log_retention_days = 14
