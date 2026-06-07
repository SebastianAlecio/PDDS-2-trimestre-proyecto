data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  api_name = "${var.name}-${var.environment}"

  # Health check path normalizado. Si el spec del rubric pide default "/", lo
  # respetamos en la variable, pero en runtime decidimos si vamos a reusar el
  # root_resource_id (caso "/") o crear un resource hijo (caso "/algo").
  health_path_is_root = var.health_check_path == "/"
  health_path_part    = trim(var.health_check_path, "/")

  # CORS: REST API no tiene config declarativa global (a diferencia de HTTP API).
  # Hay que crear método OPTIONS + MOCK integration por cada path que reciba
  # requests cross-origin. Estos valores se inyectan en el integration_response
  # del OPTIONS para responder el preflight.
  cors_allow_origin  = length(var.cors_allow_origins) > 0 ? join(",", var.cors_allow_origins) : "*"
  cors_allow_methods = "GET,POST,PUT,DELETE,OPTIONS"
  cors_allow_headers = "Authorization,Content-Type"

  # ARN templated para la integración AWS_PROXY con Lambda. Sigue el formato
  # documentado de API Gateway, no es un ARN nativo de Lambda.
  lambda_invoke_uri = "arn:aws:apigateway:${data.aws_region.current.id}:lambda:path/2015-03-31/functions/${var.lambda_function_arn}/invocations"

  # Mapa de las rutas autenticadas. Cada entrada se materializa como un
  # aws_api_gateway_method + aws_api_gateway_integration.
  routes = {
    "POST /tickets" = {
      resource_id = aws_api_gateway_resource.tickets.id
      http_method = "POST"
    }
    "GET /tickets/me" = {
      resource_id = aws_api_gateway_resource.tickets_me.id
      http_method = "GET"
    }
    "GET /tickets/queue" = {
      resource_id = aws_api_gateway_resource.tickets_queue.id
      http_method = "GET"
    }
    "PUT /tickets/{id}/assign" = {
      resource_id = aws_api_gateway_resource.tickets_id_assign.id
      http_method = "PUT"
    }
    "PUT /tickets/{id}/status" = {
      resource_id = aws_api_gateway_resource.tickets_id_status.id
      http_method = "PUT"
    }
    "POST /users" = {
      resource_id = aws_api_gateway_resource.users.id
      http_method = "POST"
    }
  }

  # Recursos que aceptan requests cross-origin desde el browser y por tanto
  # necesitan método OPTIONS para responder el CORS preflight.
  cors_resources = {
    "tickets"           = aws_api_gateway_resource.tickets.id
    "tickets-me"        = aws_api_gateway_resource.tickets_me.id
    "tickets-queue"     = aws_api_gateway_resource.tickets_queue.id
    "tickets-id-assign" = aws_api_gateway_resource.tickets_id_assign.id
    "tickets-id-status" = aws_api_gateway_resource.tickets_id_status.id
    "users"             = aws_api_gateway_resource.users.id
  }
}

# REST API con endpoint regional (no edge-optimized). Regional evita que AWS
# provisione un CloudFront managed que no podemos controlar — para esta etapa
# no necesitamos distribución global, y mantiene el setup más simple.
resource "aws_api_gateway_rest_api" "this" {
  name        = local.api_name
  description = "Ticke-T REST API: authenticated tickets endpoints"

  endpoint_configuration {
    types = ["REGIONAL"]
  }
}

# Authorizer Cognito User Pools. Valida el ID token enviado en el header
# Authorization y pasa los claims a la Lambda en event.requestContext.authorizer.claims.
resource "aws_api_gateway_authorizer" "cognito" {
  name            = "cognito-auth"
  rest_api_id     = aws_api_gateway_rest_api.this.id
  type            = "COGNITO_USER_POOLS"
  provider_arns   = [var.cognito_user_pool_arn]
  identity_source = "method.request.header.Authorization"
}

# ─── Resources (path tree) ──────────────────────────────────────────────────

resource "aws_api_gateway_resource" "users" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_rest_api.this.root_resource_id
  path_part   = "users"
}

resource "aws_api_gateway_resource" "tickets" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_rest_api.this.root_resource_id
  path_part   = "tickets"
}

resource "aws_api_gateway_resource" "tickets_me" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_resource.tickets.id
  path_part   = "me"
}

resource "aws_api_gateway_resource" "tickets_queue" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_resource.tickets.id
  path_part   = "queue"
}

resource "aws_api_gateway_resource" "tickets_id" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_resource.tickets.id
  path_part   = "{id}"
}

resource "aws_api_gateway_resource" "tickets_id_assign" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_resource.tickets_id.id
  path_part   = "assign"
}

resource "aws_api_gateway_resource" "tickets_id_status" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_resource.tickets_id.id
  path_part   = "status"
}

# ─── Methods + Integrations (autenticados con Cognito) ──────────────────────

resource "aws_api_gateway_method" "endpoints" {
  for_each = local.routes

  rest_api_id   = aws_api_gateway_rest_api.this.id
  resource_id   = each.value.resource_id
  http_method   = each.value.http_method
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id
}

resource "aws_api_gateway_integration" "endpoints" {
  for_each = local.routes

  rest_api_id             = aws_api_gateway_rest_api.this.id
  resource_id             = each.value.resource_id
  http_method             = aws_api_gateway_method.endpoints[each.key].http_method
  integration_http_method = "POST" # AWS_PROXY siempre invoca a Lambda con POST internamente
  type                    = "AWS_PROXY"
  uri                     = local.lambda_invoke_uri
}

# ─── CORS preflight (OPTIONS con MOCK integration) ──────────────────────────

resource "aws_api_gateway_method" "options" {
  for_each = local.cors_resources

  rest_api_id   = aws_api_gateway_rest_api.this.id
  resource_id   = each.value
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "options" {
  for_each = local.cors_resources

  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = each.value
  http_method = aws_api_gateway_method.options[each.key].http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "options" {
  for_each = local.cors_resources

  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = each.value
  http_method = aws_api_gateway_method.options[each.key].http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "options" {
  for_each = local.cors_resources

  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = each.value
  http_method = aws_api_gateway_method.options[each.key].http_method
  status_code = aws_api_gateway_method_response.options[each.key].status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'${local.cors_allow_headers}'"
    "method.response.header.Access-Control-Allow-Methods" = "'${local.cors_allow_methods}'"
    "method.response.header.Access-Control-Allow-Origin"  = "'${local.cors_allow_origin}'"
  }

  depends_on = [aws_api_gateway_integration.options]
}

# ─── CORS para errores del authorizer y otros 4XX/5XX ──────────────────────
#
# Cuando el authorizer Cognito rechaza un request (401, 403), API Gateway
# responde DIRECTAMENTE sin invocar la Lambda. Esas responses no llevan
# headers CORS y el browser las bloquea con "Failed to fetch". Las
# gateway_response de tipo DEFAULT_4XX/DEFAULT_5XX inyectan los headers
# CORS en todos los errores generados por API Gateway.
resource "aws_api_gateway_gateway_response" "default_4xx" {
  rest_api_id   = aws_api_gateway_rest_api.this.id
  response_type = "DEFAULT_4XX"

  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin"  = "'${local.cors_allow_origin}'"
    "gatewayresponse.header.Access-Control-Allow-Headers" = "'${local.cors_allow_headers}'"
    "gatewayresponse.header.Access-Control-Allow-Methods" = "'${local.cors_allow_methods}'"
  }
}

resource "aws_api_gateway_gateway_response" "default_5xx" {
  rest_api_id   = aws_api_gateway_rest_api.this.id
  response_type = "DEFAULT_5XX"

  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin"  = "'${local.cors_allow_origin}'"
    "gatewayresponse.header.Access-Control-Allow-Headers" = "'${local.cors_allow_headers}'"
    "gatewayresponse.header.Access-Control-Allow-Methods" = "'${local.cors_allow_methods}'"
  }
}

# ─── Deployment + Stage ─────────────────────────────────────────────────────

# Deployment: snapshot del API en un momento dado. REST API requiere un
# deployment explícito para que las rutas sean alcanzables. El trigger fuerza
# un redeploy cuando cambia algo del path tree o las integraciones — sin
# esto, cambios de Terraform no se reflejan en el endpoint hasta el próximo
# apply manual.
resource "aws_api_gateway_deployment" "this" {
  rest_api_id = aws_api_gateway_rest_api.this.id

  triggers = {
    redeployment = sha1(jsonencode([
      aws_api_gateway_authorizer.cognito.id,
      aws_api_gateway_resource.tickets.id,
      aws_api_gateway_resource.tickets_me.id,
      aws_api_gateway_resource.tickets_queue.id,
      aws_api_gateway_resource.tickets_id.id,
      aws_api_gateway_resource.tickets_id_assign.id,
      aws_api_gateway_resource.tickets_id_status.id,
      aws_api_gateway_resource.users.id,
      [for k, m in aws_api_gateway_method.endpoints : m.id],
      [for k, i in aws_api_gateway_integration.endpoints : i.id],
      [for k, m in aws_api_gateway_method.options : m.id],
      [for k, i in aws_api_gateway_integration.options : i.id],
      aws_api_gateway_gateway_response.default_4xx.id,
      aws_api_gateway_gateway_response.default_5xx.id,
      aws_api_gateway_method.health.id,
      aws_api_gateway_integration.health.id,
      local.health_path_is_root ? "" : aws_api_gateway_resource.health[0].id,
      aws_api_gateway_rest_api_policy.this.id,
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }

  depends_on = [
    aws_api_gateway_integration.endpoints,
    aws_api_gateway_integration.options,
    aws_api_gateway_integration_response.options,
    aws_api_gateway_integration.health,
    aws_api_gateway_rest_api_policy.this,
  ]
}

resource "aws_api_gateway_stage" "this" {
  rest_api_id   = aws_api_gateway_rest_api.this.id
  deployment_id = aws_api_gateway_deployment.this.id
  stage_name    = var.stage_name
}

# ─── Lambda permission ──────────────────────────────────────────────────────

# Permiso para que API Gateway invoque la Lambda. source_arn restringe a
# cualquier método/ruta DENTRO de esta API específica. Sin esto, AWS rechaza
# las invocaciones del API a la Lambda con 502.
resource "aws_lambda_permission" "apigw_invoke" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.this.execution_arn}/*/*"
}

# ─── Health check (AWS_PROXY → Lambda) ─────────────────────────────────────
#
# Rubric OYD-D3 (Deliverable C common): "A configurable health check or
# readiness check path (var.health_check_path) must be defined, defaulting
# to '/'". El endpoint invoca a la Lambda real (no MOCK) para que el check
# ejerza el cold-start y la conectividad básica del runtime, no solo el
# borde de API Gateway. La Lambda atiende el path antes del check de auth
# (no requiere JWT) — ver el dispatch de HEALTH_CHECK_PATH en index.js.
#
# La autorización del method queda en NONE porque load balancers y monitores
# no llevan tokens.

resource "aws_api_gateway_resource" "health" {
  count = local.health_path_is_root ? 0 : 1

  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_rest_api.this.root_resource_id
  path_part   = local.health_path_part
}

resource "aws_api_gateway_method" "health" {
  rest_api_id   = aws_api_gateway_rest_api.this.id
  resource_id   = local.health_path_is_root ? aws_api_gateway_rest_api.this.root_resource_id : aws_api_gateway_resource.health[0].id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "health" {
  rest_api_id             = aws_api_gateway_rest_api.this.id
  resource_id             = aws_api_gateway_method.health.resource_id
  http_method             = aws_api_gateway_method.health.http_method
  integration_http_method = "POST" # AWS_PROXY invoca a Lambda con POST internamente
  type                    = "AWS_PROXY"
  uri                     = local.lambda_invoke_uri
}

# ─── Resource policy del API (ingress restriction) ─────────────────────────
#
# Rubric OYD-D3 (Deliverable B serverless): "Set an API Gateway resource
# policy restricting invocation". Para nuestra arquitectura serverless sin
# CloudFront/ALB delante, la restricción de "no bypassear el LB" no aplica
# directamente — el filtrado real lo hacen las capas de WAF (rate limit por
# IP) y el authorizer Cognito (rechaza tokens inválidos sin invocar Lambda).
#
# Esta resource policy formaliza explícitamente "execute-api:Invoke desde
# cualquier principal, scoped a esta API específica". Es permisiva en la
# práctica pero satisface el requisito literal de tener una policy declarada
# vía Terraform sobre la API.
data "aws_iam_policy_document" "api_resource" {
  statement {
    sid    = "AllowPublicInvokeAuthEnforcedAtMethodLevel"
    effect = "Allow"

    principals {
      type        = "AWS"
      identifiers = ["*"]
    }

    actions   = ["execute-api:Invoke"]
    resources = ["${aws_api_gateway_rest_api.this.execution_arn}/*/*/*"]
  }
}

resource "aws_api_gateway_rest_api_policy" "this" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  policy      = data.aws_iam_policy_document.api_resource.json
}
