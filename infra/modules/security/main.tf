resource "aws_cognito_user_pool" "pool" {
  name = "${var.name}-${var.environment}"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = false
    require_uppercase = true
  }

  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "Tu código de verificación para Ticke-T"
    email_message        = "Tu código de verificación es {####}."
  }
}

resource "aws_cognito_user_pool_client" "client" {
  name            = "${var.name}-client-${var.environment}"
  user_pool_id    = aws_cognito_user_pool.pool.id
  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH", # Permite el uso de postman
    "ALLOW_REFRESH_TOKEN_AUTH", # Permite refrescar el Access Token cuando expire de fondo
    "ALLOW_USER_SRP_AUTH"       # Flujo por defecto y ultra-seguro de AWS Amplify (Secure Remote Password)
  ]
}