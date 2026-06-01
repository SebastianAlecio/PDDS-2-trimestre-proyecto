variable "environment" {
  description = "Deployment environment. Appended to the user pool name and propagated as a tag."
  type        = string
}

variable "name" {
  description = "Base name of the Cognito user pool. The final name is \"$${name}-$${environment}\"."
  type        = string
  default     = "ticke-t-users"
}