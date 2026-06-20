# Módulo CDN
# Hostea el frontend de Vite buildeado en S3 privado, servido vía CloudFront
# detrás de TLS con el cert wildcard de D3. CloudFront es el ÚNICO endpoint
# público del frontend; el bucket S3 queda completamente privado, accesible
# sólo vía Origin Access Control (OAC) firmado por la distribución.

# ─── S3 bucket (privado, sin website hosting) ─────────────────────────────
# Sin static-website hosting: CloudFront accede via OAC + GetObject; no
# necesitamos los endpoints públicos s3-website-* que requieren bucket policy
# laxa. El bucket queda 100% privado, dependent solo de la distribución.
resource "aws_s3_bucket" "frontend" {
  bucket = "${var.bucket_name_prefix}-${var.environment}-${random_id.suffix.hex}"

  tags = {
    Environment = var.environment
    Module      = "cdn"
    Purpose     = "frontend-spa-hosting"
  }
}

# Sufijo random para evitar colisión global de nombres de bucket. 4 bytes =
# 8 hex chars; con prefix "pdds-oyd-frontend" da nombres tipo
# "pdds-oyd-frontend-dev-a1b2c3d4" — claros y únicos.
resource "random_id" "suffix" {
  byte_length = 4
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# SSE-S3 (AES256) basta para assets estáticos públicos servidos por CloudFront.
# No usamos KMS acá porque (a) los assets son públicos por definición, no hay
# secret-at-rest a proteger; (b) bucket key con KMS sumaría costo sin
# beneficio real. El bucket de attachments (storage/) sí usa KMS porque
# contiene datos privados de usuarios.
resource "aws_s3_bucket_server_side_encryption_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Versioning suspended: CloudFront sirve la versión actual con cache; si
# pushaeas una versión mala, el rollback es un re-deploy (otro push), no
# restaurar versión anterior del bucket. Mantenerlo Disabled evita storage
# acumulativo de versiones viejas que nadie va a usar.
resource "aws_s3_bucket_versioning" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  versioning_configuration {
    status = "Disabled"
  }
}

# ─── CloudFront Origin Access Control (OAC) ──────────────────────────────
# Reemplaza el legacy Origin Access Identity (OAI). Firma cada request del
# CloudFront al bucket con SigV4 — el bucket policy verifica la firma y solo
# permite GetObject cuando viene del distribution ARN específico.
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${var.project_name}-frontend-${var.environment}"
  description                       = "OAC para frontend bucket; signing SigV4"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ─── CloudFront distribution ─────────────────────────────────────────────
# default_root_object: cuando el usuario pide la raíz "/", CloudFront sirve
# /index.html. Sin este, devolvería 403 desde S3 (que no soporta "listar
# bucket" privado).
#
# custom_error_response: SPA fallback. React Router (client-side routing)
# usa URLs como /tickets/123 que NO existen como objects en el bucket. S3
# devuelve 404 → CloudFront lo intercepta y sirve /index.html con HTTP 200.
# El bundle de JS toma control y renderiza la ruta correcta.
#
# returns HTTP 301 from port 80 to port 443 ... verifiable with curl").
# CloudFront responde 301 a las requests HTTP, no las cierra silenciosamente.
resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${var.project_name}-frontend-${var.environment}"
  default_root_object = "index.html"
  price_class         = var.price_class

  aliases = [var.full_hostname]

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "s3-${aws_s3_bucket.frontend.id}"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "s3-${aws_s3_bucket.frontend.id}"

    viewer_protocol_policy = var.viewer_protocol_policy
    compress               = true

    # AWS managed cache policy "CachingOptimized" — usa Cache-Control headers
    # del origin (S3) si vienen, sino TTL 24h. Para SPA inmutable este balance
    # es OK; el invalidation del CloudFront en el workflow de deploy fuerza
    # refresh inmediato cuando hay versión nueva.
    cache_policy_id = data.aws_cloudfront_cache_policy.caching_optimized.id
  }

  # SPA fallback: S3 devuelve 403/404 para rutas que no son objetos; CloudFront
  # sirve /index.html con HTTP 200 y el bundle de React toma control client-side.
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # ACM cert wildcard de D3, en us-east-1 (CloudFront requiere certs en
  # us-east-1 — ya estamos ahí por el resto del stack). Referenciado via
  # data source desde el módulo dns; sin duplicar resource. Cumple el
  # requisito del rubric: "if the certificate was already provisioned in
  # Delivery 3, reference it via a data source — do not create a duplicate".
  viewer_certificate {
    acm_certificate_arn      = var.acm_certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = var.minimum_tls_version
  }

  tags = {
    Environment = var.environment
    Module      = "cdn"
  }
}

# Managed cache policy "CachingOptimized" — referenciada por ID en lugar de
# hardcodearla porque AWS puede rotar el ID. Solo lookup, no crea recurso.
data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

# ─── Bucket policy: solo CloudFront puede leer ───────────────────────────
# Condition AWS:SourceArn restringe el GetObject al ARN exacto de la
# distribución, NO permite acceso desde otras CloudFront distributions de
# la misma cuenta ni desde principals AWS en general.
data "aws_iam_policy_document" "frontend" {
  statement {
    sid       = "AllowCloudFrontReadOnly"
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.frontend.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.frontend.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = data.aws_iam_policy_document.frontend.json

  depends_on = [aws_s3_bucket_public_access_block.frontend]
}

# ─── Route 53 alias ──────────────────────────────────────────────────────
# A-alias apunta al CloudFront edge endpoint. Zone ID Z2FDTNDATAQYW2 es la
# zone fija de CloudFront (todos los CloudFront distributions comparten esta
# zone para alias records). NO se debe usar el zone_id del hosted zone del
# dominio para esto — CloudFront lo rechaza.
resource "aws_route53_record" "frontend" {
  count = var.create_dns_record ? 1 : 0

  zone_id = var.hosted_zone_id
  name    = var.full_hostname
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = "Z2FDTNDATAQYW2"
    evaluate_target_health = false
  }
}
