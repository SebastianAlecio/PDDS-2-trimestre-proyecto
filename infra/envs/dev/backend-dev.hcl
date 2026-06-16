# Backend config para el environment dev. Se pasa como
# `terraform init -backend-config=envs/dev/backend-dev.hcl`. El backend.tf
# raíz declara solo `backend "s3" {}` vacío para que esta config externa
# pueda inyectarse — pattern A de OYD-D4 ("separate backend configs").
#
# La key incluye literalmente "dev" (rubric exige: "the backend key must
# include the environment name"). El state previo a la migración vivía en
# infra/terraform.tfstate y fue movido a infra/envs/dev/terraform.tfstate
# con `terraform init -migrate-state -force-copy` el día de la migración
# inicial de OYD-D4. Backup: infra/terraform.tfstate.backup-pre-d4.

bucket         = "pdds-oyd-tfstate-58814d50"
key            = "infra/envs/dev/terraform.tfstate"
region         = "us-east-1"
dynamodb_table = "pdds-oyd-tflock"
encrypt        = true
