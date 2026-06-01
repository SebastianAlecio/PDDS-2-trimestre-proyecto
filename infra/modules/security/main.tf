locals {
  user_pool_name = "${var.name}-${var.environment}"
}

resource "aws_cognito_user_pool" "pool" {
  name = local.user_pool_name

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = false
    require_uppercase = true
  }

  # Solo un admin (consola AWS o CLI) puede crear usuarios; el self sign-up
  # queda deshabilitado. Los 4 roles del sistema (colaborador, agente-n1,
  # agente-n2, gerente) se asignan al alta del usuario.
  admin_create_user_config {
    allow_admin_create_user_only = true

    invite_message_template {
      email_subject = "Tus credenciales para Ticke-T"
      email_message = "Hola {username}, tu cuenta de Ticke-T fue creada. Tu contraseña temporal es {####}. Te pedirá cambiarla en el primer inicio de sesión."
      sms_message   = "Tu usuario es {username} y tu contraseña temporal es {####}."
    }
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "Tu código de verificación para Ticke-T"
    email_message        = "Tu código de verificación es {####}."
  }

  # email y name son atributos built-in de Cognito; quedan habilitados sin
  # necesidad de declarar un bloque schema. Los schema blocks solo se usan
  # para atributos custom (`custom:role`, etc.) — Cognito no soporta agregar
  # atributos custom requeridos en pools ya existentes.
}

resource "aws_cognito_user_pool_client" "client" {
  name            = "${var.name}-client-${var.environment}"
  user_pool_id    = aws_cognito_user_pool.pool.id
  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH", # Permite el uso de postman / CLI
    "ALLOW_REFRESH_TOKEN_AUTH", # Permite refrescar el Access Token de fondo
    "ALLOW_USER_SRP_AUTH"       # Flujo por defecto y seguro (Secure Remote Password)
  ]

  # TTL de tokens. ID y Access cortos para que cambios de grupo se reflejen
  # razonablemente rápido; Refresh largo para que el usuario no tenga que
  # volver a loguear cada hora.
  access_token_validity  = 1
  id_token_validity      = 1
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  prevent_user_existence_errors = "ENABLED"
}

# Cuatro roles del dominio. El claim cognito:groups del ID token los expone
# tanto al frontend (guards de rutas) como al backend (autorización por rol).
resource "aws_cognito_user_group" "colaborador" {
  name         = "colaborador"
  user_pool_id = aws_cognito_user_pool.pool.id
  description  = "Empleado que crea tickets y chatea con soporte (US-01, US-02)."
  precedence   = 40
}

resource "aws_cognito_user_group" "agente_n1" {
  name         = "agente-n1"
  user_pool_id = aws_cognito_user_pool.pool.id
  description  = "Soporte de primera línea: atiende cola, responde, escala a N2 (US-03, US-07)."
  precedence   = 20
}

resource "aws_cognito_user_group" "agente_n2" {
  name         = "agente-n2"
  user_pool_id = aws_cognito_user_pool.pool.id
  description  = "Soporte especializado: recibe escalamientos desde N1."
  precedence   = 10
}

resource "aws_cognito_user_group" "gerente" {
  name         = "gerente"
  user_pool_id = aws_cognito_user_pool.pool.id
  description  = "Supervisión: métricas agregadas, gestión de accesos del equipo (US-06)."
  precedence   = 0
}
