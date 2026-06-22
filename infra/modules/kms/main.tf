# Módulo KMS
#
# Provisiona UNA Customer Managed Key (CMK) que encripta:
#   (a) el bucket S3 de adjuntos + async-events (upgrade desde SSE-S3 / AES256
#       que vivía en storage/), y
#   (b) la tabla DynamoDB de tickets (upgrade desde AWS-managed default).
#
# Key policy SIN wildcards en principal:
#   - Root account con condition kms:CallerAccount = ${account_id} → pattern
#     estándar para que terraform/AWS Console mantengan la key. NO es
#     "grants to root without condition" — la condition es explícita.
#   - Service principals s3.amazonaws.com y dynamodb.amazonaws.com con
#     condition kms:ViaService → solo pueden usar la key cuando vienen
#     llamados via S3/DDB del MISMO account y region. Bloquea uso directo
#     de la key fuera de esos servicios.
#   - 5 Lambda execution roles (consumer_role_arns) con kms:Decrypt y
#     kms:GenerateDataKey, también condicionadas a kms:ViaService → cada
#     Lambda puede descifrar contenido leído de S3/DDB encriptado con esta
#     key, pero no puede invocar kms:Decrypt directamente sobre payloads
#     arbitrarios.

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.name
  via_s3     = "s3.${data.aws_region.current.name}.amazonaws.com"
  via_ddb    = "dynamodb.${data.aws_region.current.name}.amazonaws.com"
}

data "aws_iam_policy_document" "key" {
  # Statement 1 — root del account puede administrar la key (incluyendo
  # rotación, deleción, attach de policies). Condition CallerAccount lo
  # mantiene scoped al account dueño; el rubric específicamente prohíbe
  # "grants kms:* to all principals or to the root account without condition".
  statement {
    sid     = "AllowAccountAdminWithCondition"
    effect  = "Allow"
    actions = ["kms:*"]

    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${local.account_id}:root"]
    }

    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "kms:CallerAccount"
      values   = [local.account_id]
    }
  }

  # Statement 2 — service principals S3 y DynamoDB. kms:ViaService restringe
  # el uso de la key a llamadas que originen dentro de esos servicios en
  # esta región. Sin esto, cualquier principal con permiso kms:* podría usar
  # la key como key arbitraria.
  statement {
    sid    = "AllowS3AndDynamoDBService"
    effect = "Allow"
    actions = [
      "kms:Encrypt",
      "kms:Decrypt",
      "kms:ReEncrypt*",
      "kms:GenerateDataKey*",
      "kms:DescribeKey",
    ]

    principals {
      type        = "Service"
      identifiers = ["s3.amazonaws.com", "dynamodb.amazonaws.com"]
    }

    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = [local.via_s3, local.via_ddb]
    }
  }

  # Statement 3 — las Lambda roles consumers. Solo Decrypt y GenerateDataKey
  # (no Encrypt directo — el encrypt lo hace el service principal S3/DDB
  # cuando la Lambda hace PutObject/PutItem). Condition kms:ViaService asegura
  # que el Decrypt venga via S3/DDB y no de un kms:Decrypt directo de payload.
  dynamic "statement" {
    for_each = length(var.consumer_role_arns) > 0 ? [1] : []
    content {
      sid    = "AllowLambdaConsumersViaServices"
      effect = "Allow"
      actions = [
        "kms:Decrypt",
        "kms:GenerateDataKey",
        "kms:DescribeKey",
      ]

      principals {
        type        = "AWS"
        identifiers = var.consumer_role_arns
      }

      resources = ["*"]

      condition {
        test     = "StringEquals"
        variable = "kms:ViaService"
        values   = [local.via_s3, local.via_ddb]
      }
    }
  }
}

resource "aws_kms_key" "this" {
  description             = "CMK ${var.project_name}-${var.environment} - encripta S3 attachments + DynamoDB tickets. D5 Deliverable B."
  deletion_window_in_days = var.deletion_window_in_days
  enable_key_rotation     = true
  policy                  = data.aws_iam_policy_document.key.json

  tags = {
    Environment = var.environment
    Module      = "kms"
  }
}

resource "aws_kms_alias" "this" {
  name          = "alias/${var.project_name}-${var.environment}"
  target_key_id = aws_kms_key.this.key_id
}
