module "compute" {
  source = "./modules/compute"

  environment = var.environment
  name        = var.compute_function_name
  memory_size = var.compute_memory_size
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
