module "compute" {
  source = "./modules/compute"

  environment = var.environment
  name        = var.compute_function_name
  memory_size = var.compute_memory_size

  attach_dynamodb_policy = true
  dynamodb_table_arn     = module.database.table_arn

  attach_attachments_bucket_policy = true
  attachments_bucket_arn           = module.storage.bucket_arn

  environment_variables = {
    TICKETS_TABLE_NAME      = module.database.table_name
    ATTACHMENTS_BUCKET_NAME = module.storage.bucket_name
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
