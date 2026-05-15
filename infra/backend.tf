terraform {
  backend "s3" {
    bucket         = "pdds-oyd-tfstate-d0d13937"
    key            = "infra/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "pdds-oyd-tflock"
    encrypt        = true
  }
}
