locals {
  # Wildcard que cubre cualquier hostname directo bajo el subdominio elegido
  # (ej. api.ticke-t.lumenchat.app, app.ticke-t.lumenchat.app). No cubre el
  # apex del subdomain ni segundos niveles. Para esta entrega es suficiente.
  # Se deriva quitando el primer label del api_full_hostname.
  wildcard_name = "*.${join(".", slice(split(".", var.api_full_hostname), 1, length(split(".", var.api_full_hostname))))}"
}

# ─── Hosted zone del dominio raíz ──────────────────────────────────────────
#
# Esta hosted zone administra el DNS del dominio. Cuando los nameservers del
# dominio se cambien en el registrador a los 4 que AWS asigna acá (output
# zone_nameservers), TODO el DNS de lumenchat.app pasa a manejarse desde
# Route 53 — por eso declaramos abajo todos los records necesarios.
resource "aws_route53_zone" "this" {
  name = var.parent_domain

  comment = "Ticke-T · zone primaria para ${var.parent_domain}"

  tags = {
    Environment = var.environment
  }
}

# ─── Records DNS del dominio ───────────────────────────────────────────────

resource "aws_route53_record" "apex_a" {
  count = var.apex_a_record != "" ? 1 : 0

  zone_id = aws_route53_zone.this.zone_id
  name    = var.parent_domain
  type    = "A"
  ttl     = 1800
  records = [var.apex_a_record]
}

resource "aws_route53_record" "apex_aaaa" {
  count = var.apex_aaaa_record != "" ? 1 : 0

  zone_id = aws_route53_zone.this.zone_id
  name    = var.parent_domain
  type    = "AAAA"
  ttl     = 1800
  records = [var.apex_aaaa_record]
}

resource "aws_route53_record" "apex_mx" {
  count = length(var.apex_mx_records) > 0 ? 1 : 0

  zone_id = aws_route53_zone.this.zone_id
  name    = var.parent_domain
  type    = "MX"
  ttl     = 14400
  records = var.apex_mx_records
}

resource "aws_route53_record" "apex_txt" {
  count = length(var.apex_txt_records) > 0 ? 1 : 0

  zone_id = aws_route53_zone.this.zone_id
  name    = var.parent_domain
  type    = "TXT"
  ttl     = 3600
  records = var.apex_txt_records
}

resource "aws_route53_record" "subdomain" {
  for_each = {
    for r in var.subdomain_records : "${r.type}-${r.name}" => r
  }

  zone_id = aws_route53_zone.this.zone_id
  name    = each.value.name == "@" ? var.parent_domain : "${each.value.name}.${var.parent_domain}"
  type    = each.value.type
  ttl     = each.value.ttl
  records = [each.value.value]
}

# ─── Certificado ACM (solo si enable_api_custom_domain) ────────────────────
#
# Wildcard sobre *.ticke-t.<parent> en us-east-1 (misma región del REST API
# regional). Validación por DNS: ACM genera un CNAME de validación que
# Terraform escribe automáticamente en la hosted zone. Cuando los nameservers
# del registrador estén apuntando a Route 53 y propagados, ACM valida en
# minutos.
resource "aws_acm_certificate" "wildcard" {
  count = var.enable_api_custom_domain ? 1 : 0

  domain_name       = local.wildcard_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Environment = var.environment
  }
}

resource "aws_route53_record" "cert_validation" {
  for_each = var.enable_api_custom_domain ? {
    for dvo in aws_acm_certificate.wildcard[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  zone_id         = aws_route53_zone.this.zone_id
  name            = each.value.name
  type            = each.value.type
  ttl             = 60
  records         = [each.value.record]
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "wildcard" {
  count = var.enable_api_custom_domain ? 1 : 0

  certificate_arn         = aws_acm_certificate.wildcard[0].arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]

  timeouts {
    create = "15m"
  }
}

# ─── Custom domain del API Gateway ─────────────────────────────────────────
#
# Endpoint regional: el cert debe vivir en la misma región del API (us-east-1).
# El base_path vacío hace que api.<...>.app/tickets caiga directo en el stage
# "api" del REST API, sin segmento extra de path.
resource "aws_api_gateway_domain_name" "api" {
  count = var.enable_api_custom_domain ? 1 : 0

  domain_name              = var.api_full_hostname
  regional_certificate_arn = aws_acm_certificate_validation.wildcard[0].certificate_arn

  endpoint_configuration {
    types = ["REGIONAL"]
  }

  security_policy = "TLS_1_2"

  tags = {
    Environment = var.environment
  }
}

resource "aws_api_gateway_base_path_mapping" "api" {
  count = var.enable_api_custom_domain ? 1 : 0

  api_id      = var.api_gateway_id
  stage_name  = var.api_gateway_stage_name
  domain_name = aws_api_gateway_domain_name.api[0].domain_name
}

# A-alias en la hosted zone apuntando al regional endpoint del custom domain.
# evaluate_target_health = false porque API Gateway no expone health checks —
# usar el default true rompe la resolución.
resource "aws_route53_record" "api" {
  count = var.enable_api_custom_domain ? 1 : 0

  zone_id = aws_route53_zone.this.zone_id
  name    = var.api_full_hostname
  type    = "A"

  alias {
    name                   = aws_api_gateway_domain_name.api[0].regional_domain_name
    zone_id                = aws_api_gateway_domain_name.api[0].regional_zone_id
    evaluate_target_health = false
  }
}

# ─── SES domain identity + DKIM ────────────────────────────────────────────
#
# Una vez que estos records propaguen, SES marca el dominio como Verified y
# permite mandar emails desde cualquier *@parent_domain. La cuenta queda en
# SES sandbox por default: addresses destinatarios igual tienen que
# verificarse individualmente en consola SES mientras la cuenta no salga del
# sandbox (requiere ticket a AWS support — días).
#
# aws_ses_domain_identity registra el dominio en SES y genera un token de
# verificación. El TXT _amazonses contiene ese token y permite a SES
# confirmar la propiedad del dominio.
#
# aws_ses_domain_dkim genera 3 keys CNAME que se publican como records DNS.
# DKIM firma cada email saliente y mejora la deliverability (los emails no
# caen en spam por dominio sospechoso).
resource "aws_ses_domain_identity" "this" {
  count  = var.enable_ses_domain_identity ? 1 : 0
  domain = var.parent_domain
}

resource "aws_route53_record" "ses_verification" {
  count = var.enable_ses_domain_identity ? 1 : 0

  zone_id = aws_route53_zone.this.zone_id
  name    = "_amazonses.${var.parent_domain}"
  type    = "TXT"
  ttl     = 600
  records = [aws_ses_domain_identity.this[0].verification_token]
}

# Espera hasta que SES marque el dominio como verified leyendo el TXT.
# Puede tardar varios minutos por la propagación DNS.
resource "aws_ses_domain_identity_verification" "this" {
  count = var.enable_ses_domain_identity ? 1 : 0

  domain     = aws_ses_domain_identity.this[0].id
  depends_on = [aws_route53_record.ses_verification]

  timeouts {
    create = "15m"
  }
}

resource "aws_ses_domain_dkim" "this" {
  count  = var.enable_ses_domain_identity ? 1 : 0
  domain = aws_ses_domain_identity.this[0].domain
}

resource "aws_route53_record" "ses_dkim" {
  count = var.enable_ses_domain_identity ? 3 : 0

  zone_id = aws_route53_zone.this.zone_id
  name    = "${aws_ses_domain_dkim.this[0].dkim_tokens[count.index]}._domainkey.${var.parent_domain}"
  type    = "CNAME"
  ttl     = 600
  records = ["${aws_ses_domain_dkim.this[0].dkim_tokens[count.index]}.dkim.amazonses.com"]
}
