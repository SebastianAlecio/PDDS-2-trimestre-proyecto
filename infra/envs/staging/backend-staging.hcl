# Backend config para el environment staging. Misma bucket + dynamodb_table
# que dev (el lock table soporta múltiples keys sin conflicto), pero el key
# está totalmente segregado bajo envs/staging/ — eso garantiza que un apply
# en staging no puede leer ni escribir el state de dev por accidente.
#
# Cuando se hace el primer init -backend-config=envs/staging/backend-staging.hcl
# desde un workdir sin .terraform/, Terraform crea el state file vacío y se
# pueden aplicar los recursos como un greenfield deploy del subset de staging.

bucket         = "pdds-oyd-tfstate-d0d13937"
key            = "infra/envs/staging/terraform.tfstate"
region         = "us-east-1"
dynamodb_table = "pdds-oyd-tflock"
encrypt        = true
