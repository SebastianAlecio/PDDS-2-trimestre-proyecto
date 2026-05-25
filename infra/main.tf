module "compute" {
  source = "./modules/compute"

  environment = var.environment
  name        = var.compute_function_name
  memory_size = var.compute_memory_size

  attach_dynamodb_policy = true
  dynamodb_table_arn     = module.database.table_arn
  environment_variables = {
    TICKETS_TABLE_NAME = module.database.table_name
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
