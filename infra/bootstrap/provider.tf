terraform {
  required_version = "~> 1.8"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # No backend block: this workspace manages the resources that host the remote
  # state for the main workspace, so it must rely on local state. The
  # terraform.tfstate file in this directory is committed to the repository
  # alongside the Terraform code.
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "Terraform"
      Workspace   = "bootstrap"
    }
  }
}
