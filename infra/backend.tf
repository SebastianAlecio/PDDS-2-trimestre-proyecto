# Backend "s3" declarado SIN configuración inline — los valores se inyectan
# por CLI con `terraform init -backend-config=envs/<env>/backend-<env>.hcl`.
# Eso permite que el mismo workdir sirva para múltiples environments (dev,
# staging) con state files separados, satisfaciendo el rubric OYD-D4
# Deliverable D ("separate remote state per environment").
#
# Si corrés terraform localmente, NUNCA omitas el -backend-config: sin él
# Terraform tirará un error pidiendo bucket/key/region. Los workflows de
# GitHub Actions pasan el backend-config explícitamente por job.

terraform {
  backend "s3" {}
}
