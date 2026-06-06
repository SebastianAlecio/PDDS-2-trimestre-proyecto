module "compute" {
  source = "./modules/compute"

  environment = var.environment
  name        = var.compute_function_name
  memory_size = var.compute_memory_size

  attach_dynamodb_policy = true
  dynamodb_table_arn     = module.database.table_arn

  attach_attachments_bucket_policy = true
  attachments_bucket_arn           = module.storage.bucket_arn

  attach_cognito_policy = true
  cognito_user_pool_arn = module.security.user_pool_arn

  environment_variables = {
    TICKETS_TABLE_NAME      = module.database.table_name
    ATTACHMENTS_BUCKET_NAME = module.storage.bucket_name
    COGNITO_USER_POOL_ID    = module.security.user_pool_id
  }
}

module "storage" {
  source = "./modules/storage"

  environment        = var.environment
  bucket_name_prefix = var.attachments_bucket_name_prefix
}

module "database" {
  source = "./modules/database"

  environment  = var.environment
  name         = var.tickets_table_name
  billing_mode = var.db_billing_mode
}

module "security" {
  source = "./modules/security"

  environment = var.environment
  name        = var.cognito_name
}

module "api" {
  source = "./modules/api"

  environment = var.environment
  name        = var.api_name
  stage_name  = var.api_stage_name

  lambda_function_arn  = module.compute.function_arn
  lambda_function_name = module.compute.function_name

  cognito_user_pool_arn = module.security.user_pool_arn

  cors_allow_origins = var.api_cors_allow_origins
}

module "waf" {
  source = "./modules/waf"

  environment           = var.environment
  name                  = var.waf_name
  api_gateway_stage_arn = module.api.stage_arn
  rate_limit_per_5min   = var.waf_rate_limit_per_5min
}

# DNS migrado desde Hostinger. Solo se instancia si var.dns_parent_domain
# está seteado. Esta versión maneja la HOSTED ZONE COMPLETA del dominio
# (lumenchat.app), no solo un subdominio delegado, porque Hostinger no
# soporta records NS en su UI y la única forma de delegar a Route 53 es
# cambiar los nameservers del dominio entero.
#
# Los records inline replican uno a uno los que estaban en Hostinger antes
# del cambio de nameservers (apex A/AAAA, MX para email, TXT para SPF/DMARC,
# CNAMEs para www/ftp/correo/DKIM). Si en algún momento se agregue un record
# en Route 53 que no esté acá, hay que sumarlo a esta lista o se perderá en
# el próximo apply.
module "dns" {
  source = "./modules/dns"
  count  = var.dns_parent_domain != "" ? 1 : 0

  environment              = var.environment
  parent_domain            = var.dns_parent_domain
  api_full_hostname        = var.dns_api_full_hostname
  enable_api_custom_domain = var.dns_enable_api_custom_domain
  api_gateway_id           = module.api.api_id
  api_gateway_stage_name   = var.api_stage_name

  # Records preservados del DNS de Hostinger.
  apex_a_record    = "82.25.83.178"
  apex_aaaa_record = "2a02:4780:2b:2099:0:1692:2e5b:2"
  apex_mx_records = [
    "5 mx1.hostinger.com",
    "10 mx2.hostinger.com",
  ]
  apex_txt_records = [
    "v=spf1 include:_spf.mail.hostinger.com ~all",
  ]
  subdomain_records = [
    { name = "www", type = "CNAME", value = "lumenchat.app", ttl = 300 },
    { name = "ftp", type = "A", value = "82.25.83.178", ttl = 1800 },
    { name = "autoconfig", type = "CNAME", value = "autoconfig.mail.hostinger.com", ttl = 300 },
    { name = "autodiscover", type = "CNAME", value = "autodiscover.mail.hostinger.com", ttl = 300 },
    { name = "_dmarc", type = "TXT", value = "v=DMARC1; p=none", ttl = 3600 },
    { name = "hostingermail-a._domainkey", type = "CNAME", value = "hostingermail-a.dkim.mail.hostinger.com", ttl = 300 },
    { name = "hostingermail-b._domainkey", type = "CNAME", value = "hostingermail-b.dkim.mail.hostinger.com", ttl = 300 },
    { name = "hostingermail-c._domainkey", type = "CNAME", value = "hostingermail-c.dkim.mail.hostinger.com", ttl = 300 },
  ]
}
