environment                    = "staging"
project_name                   = "pdds-oyd"
region                         = "us-east-1"
attachments_bucket_name_prefix = "pdds-oyd-attachments-staging"
compute_function_name          = "chat-message-handler"
compute_memory_size            = 256
tickets_table_name             = "tickets"
db_billing_mode                = "PAY_PER_REQUEST"
api_health_check_path          = "/health"

# DNS / SES / custom domain DESACTIVADOS en staging para no chocar con dev
# por el control del dominio lumenchat.app y los certs ACM. Si en algún
# punto staging necesita su propio sub-dominio (ej. staging.ticke-t.lumenchat.app)
# se vira la flag — por ahora la API de staging vive en el endpoint default
# de API Gateway sin DNS gestionado.
dns_parent_domain              = ""
dns_api_full_hostname          = ""
dns_enable_api_custom_domain   = false
dns_enable_ses_domain_identity = false

# SES igual deshabilitado en staging — el notifier no manda emails.
ses_from_address = ""

# WebSocket sin custom domain en staging — vive en wss://<id>.execute-api...
dns_ws_full_hostname        = ""
dns_enable_ws_custom_domain = false

# Notificaciones — staging usa retries más conservadores y retención más
# corta porque el costo y la presión operativa son distintos a dev.
notifications_max_receive_count = 5

# ─── OIDC (OYD-D5 Deliverable C) ─────────────────────────────────────────
# El OIDC provider de GitHub Actions ya se crea en dev (es uno por cuenta AWS).
# En staging NO lo recreamos — el ci_runner role del dev cubre sub claim
# environment:staging gracias a la trust policy con 4 conditions.
enable_github_oidc = false

# ─── Frontend CDN (D5 D) ─────────────────────────────────────────────────
# Sin DNS administrado en staging, no se monta el CloudFront ni custom domain.
enable_frontend_cdn    = false
frontend_full_hostname = ""

# ─── Observability (D5 E) ────────────────────────────────────────────────
# Mismo email que dev — un solo inbox concentra alarmas de ambos envs.
# Budget más bajo y retention más corta porque staging se prende solo para
# demos/pruebas (costo esperado < 10 USD/mes).
notification_email = "sebastianalecio@gmail.com"
monthly_budget_usd = 10
log_retention_days = 7
