locals {
  web_acl_name = "${var.name}-${var.environment}"
}

# Web ACL en scope REGIONAL (necesario para REST API stages, ALB, AppSync).
# Default action: ALLOW — solo bloqueamos lo que matchee reglas explícitas.
#
# La única regla activa es rate limit por IP. Razón: en un MVP de helpdesk
# interno autenticado, el riesgo dominante es brute-force al endpoint
# público (intentos de login Cognito, scraping).
resource "aws_wafv2_web_acl" "this" {
  name        = local.web_acl_name
  description = "Ticke-T WAF: rate-limit on the REST API public ingress"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  rule {
    name     = "rate-limit-per-ip"
    priority = 0

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = var.rate_limit_per_5min
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.web_acl_name}-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = local.web_acl_name
    sampled_requests_enabled   = true
  }
}

# Asociación al stage del REST API. WAF v2 soporta REST API stages nativamente
# (a diferencia de HTTP API v2). Cualquier request al stage pasa por las
# reglas del Web ACL antes de llegar al authorizer Cognito o a la Lambda.
resource "aws_wafv2_web_acl_association" "api_stage" {
  resource_arn = var.api_gateway_stage_arn
  web_acl_arn  = aws_wafv2_web_acl.this.arn
}
