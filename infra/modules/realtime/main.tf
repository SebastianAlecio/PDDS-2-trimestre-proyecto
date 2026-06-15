locals {
  api_name = "${var.name}-${var.environment}"
}

# WebSocket API: routing por el campo `action` del JSON enviado por el cliente.
# routes que NO son del schema interno ($connect, $disconnect) se distinguen
# por ese campo.
resource "aws_apigatewayv2_api" "ws" {
  name                       = local.api_name
  protocol_type              = "WEBSOCKET"
  route_selection_expression = "$request.body.action"

  tags = {
    Environment = var.environment
  }
}

# AWS_PROXY integration a la Lambda chat-ws. Una integration por route — todas
# apuntan a la misma Lambda pero permite tener configs distintas si crece.
locals {
  routes = ["$connect", "$disconnect", "sendMessage"]
}

resource "aws_apigatewayv2_integration" "lambda" {
  for_each = toset(local.routes)

  api_id           = aws_apigatewayv2_api.ws.id
  integration_type = "AWS_PROXY"
  integration_uri  = var.lambda_function_arn
}

resource "aws_apigatewayv2_route" "routes" {
  for_each = toset(local.routes)

  api_id             = aws_apigatewayv2_api.ws.id
  route_key          = each.value
  authorization_type = "NONE" # JWT se valida dentro del $connect handler
  target             = "integrations/${aws_apigatewayv2_integration.lambda[each.value].id}"
}

# Deployment + Stage. Trigger por hash de routes/integrations para forzar
# redeploy cuando algo cambia (mismo patrón que el REST API).
resource "aws_apigatewayv2_deployment" "this" {
  api_id = aws_apigatewayv2_api.ws.id

  triggers = {
    redeployment = sha1(jsonencode([
      [for k, r in aws_apigatewayv2_route.routes : r.id],
      [for k, i in aws_apigatewayv2_integration.lambda : i.id],
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }

  depends_on = [
    aws_apigatewayv2_route.routes,
    aws_apigatewayv2_integration.lambda,
  ]
}

resource "aws_apigatewayv2_stage" "chat" {
  api_id        = aws_apigatewayv2_api.ws.id
  name          = var.stage_name
  deployment_id = aws_apigatewayv2_deployment.this.id

  default_route_settings {
    throttling_burst_limit = var.throttling_burst_limit
    throttling_rate_limit  = var.throttling_rate_limit
  }

  tags = {
    Environment = var.environment
  }
}

# Permiso para que API GW WS invoque la Lambda en cualquier route de este API.
resource "aws_lambda_permission" "apigw_ws_invoke" {
  statement_id  = "AllowAPIGatewayWSInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.ws.execution_arn}/*/*"
}

# ─── Custom domain WSS (solo si enable_custom_domain) ──────────────────────

resource "aws_apigatewayv2_domain_name" "ws" {
  count       = var.enable_custom_domain ? 1 : 0
  domain_name = var.domain_name

  domain_name_configuration {
    certificate_arn = var.regional_certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }

  tags = {
    Environment = var.environment
  }
}

resource "aws_apigatewayv2_api_mapping" "ws" {
  count       = var.enable_custom_domain ? 1 : 0
  api_id      = aws_apigatewayv2_api.ws.id
  domain_name = aws_apigatewayv2_domain_name.ws[0].id
  stage       = aws_apigatewayv2_stage.chat.id
}

# A-alias del WS custom domain en Route 53. Vive en el módulo realtime (no
# en dns) para romper el ciclo: si el record estuviera en dns, dns dependería
# de realtime.regional_domain_name Y realtime dependería de dns.api_certificate_arn.
# Acá dependemos solo de la hosted zone id que dns expone — relación unidireccional.
resource "aws_route53_record" "ws" {
  count = var.enable_custom_domain && var.route53_zone_id != "" ? 1 : 0

  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_apigatewayv2_domain_name.ws[0].domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.ws[0].domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}
