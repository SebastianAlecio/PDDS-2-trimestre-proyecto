environment                    = "dev"
project_name                   = "pdds-oyd"
region                         = "us-east-1"
attachments_bucket_name_prefix = "pdds-oyd-attachments"
compute_function_name          = "chat-message-handler"
compute_memory_size            = 128
tickets_table_name             = "tickets"
db_billing_mode                = "PAY_PER_REQUEST"

# DNS migrado de Hostinger a Route 53. Apply 1 crea la hosted zone del dominio
# entero (lumenchat.app) con todos los records preservados; nos da 4 NS que se
# pegan en Hostinger → Domain → Nameservers → Change Nameservers → Custom.
# Apply 2 (después de propagación) sube enable_api_custom_domain a true y
# crea el cert ACM + custom domain del API + A-alias para api.ticke-t.lumenchat.app.
dns_parent_domain            = "lumenchat.app"
dns_api_full_hostname        = "api.ticke-t.lumenchat.app"
dns_enable_api_custom_domain = true
