resource "random_id" "bucket_suffix" {
  byte_length = 4
}

resource "aws_s3_bucket" "this" {
  bucket = "${var.bucket_name_prefix}-${var.environment}-${random_id.bucket_suffix.hex}"
}

resource "aws_s3_bucket_versioning" "this" {
  bucket = aws_s3_bucket.this.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "this" {
  bucket = aws_s3_bucket.this.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# CORS para uploads directos del browser vía presigned PUT URL.
# Sin este config, S3 rechaza el preflight OPTIONS y el PUT del browser
# falla con "CORS error" (visible solo en DevTools, sin mensaje claro).
# AllowedHeaders incluye Content-Type porque el presigned URL lo bindea.
# ExposeHeaders incluye ETag para que el frontend pueda verificar la
# integridad del upload si lo necesita.
resource "aws_s3_bucket_cors_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  cors_rule {
    allowed_methods = ["PUT", "GET", "HEAD"]
    allowed_origins = var.cors_allowed_origins
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  rule {
    id     = "attachments-tiering"
    status = "Enabled"

    filter {
      prefix = var.lifecycle_prefix
    }

    transition {
      days          = var.lifecycle_ia_transition_days
      storage_class = "STANDARD_IA"
    }

    noncurrent_version_expiration {
      noncurrent_days = var.lifecycle_noncurrent_expiration_days
    }
  }

  depends_on = [aws_s3_bucket_versioning.this]
}

data "aws_iam_policy_document" "ssl_only" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]

    resources = [
      aws_s3_bucket.this.arn,
      "${aws_s3_bucket.this.arn}/*",
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "ssl_only" {
  bucket = aws_s3_bucket.this.id
  policy = data.aws_iam_policy_document.ssl_only.json

  depends_on = [aws_s3_bucket_public_access_block.this]
}
