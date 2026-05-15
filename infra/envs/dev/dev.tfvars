environment                    = "dev"
project_name                   = "pdds-oyd"
region                         = "us-east-1"
attachments_bucket_name_prefix = "pdds-oyd-attachments"
compute_function_name          = "chat-message-handler"
compute_memory_size            = 128
db_instance_class              = "db.t4g.micro"
db_multi_az                    = false
db_username                    = "tickets_admin"
# db_password is intentionally absent — sourced via TF_VAR_db_password env var.
