locals {
  table_name = "${var.name}-${var.environment}"
}

# Tabla single-table de soporte de tickets.
#
# Convención de items:
#   - Ticket    : PK = "TICKET#{id}", SK = "METADATA"
#   - Mensaje   : PK = "TICKET#{id}", SK = "MSG#{iso_ts}#{msg_id}"
#
# Atributos de GSI por tipo de item:
#   - Ticket   → GSI1-PK (USER#...), GSI3-PK ("TICKETS"), GSI4-PK (STATUS#...),
#                GSI4-SK (PRIO#...#{fecha_inicio}). GSI2-PK solo al asignar
#                un agente (AGENT#...).
#   - Mensaje  → GSI3-PK ("MENSAJES"). Los demás GSI-PK quedan ausentes para
#                que el mensaje no aparezca en esos índices.
#
# Si un item no setea el atributo PK de un GSI, queda fuera del índice
# (sparse index pattern) — patrón estándar de DynamoDB.

resource "aws_dynamodb_table" "this" {
  name         = local.table_name
  billing_mode = var.billing_mode
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  attribute {
    name = "GSI1-PK"
    type = "S"
  }

  attribute {
    name = "GSI2-PK"
    type = "S"
  }

  attribute {
    name = "GSI3-PK"
    type = "S"
  }

  attribute {
    name = "GSI4-PK"
    type = "S"
  }

  attribute {
    name = "GSI4-SK"
    type = "S"
  }

  attribute {
    name = "fecha_inicio"
    type = "S"
  }

  # GSI1 — "Mis tickets" del colaborador.
  global_secondary_index {
    name            = "GSI1"
    hash_key        = "GSI1-PK"
    range_key       = "fecha_inicio"
    projection_type = "ALL"
  }

  # GSI2 — Cola del agente. Solo aparece cuando el ticket se asigna.
  global_secondary_index {
    name            = "GSI2"
    hash_key        = "GSI2-PK"
    range_key       = "fecha_inicio"
    projection_type = "ALL"
  }

  # GSI3 — Reporte del gerente (PK = "TICKETS") y feed global de
  # mensajes (PK = "MENSAJES"). Proyección INCLUDE para mantener barato
  # el listado: solo metadata mínima del ticket viaja al índice.
  global_secondary_index {
    name               = "GSI3"
    hash_key           = "GSI3-PK"
    range_key          = "fecha_inicio"
    projection_type    = "INCLUDE"
    non_key_attributes = ["titulo", "estado"]
  }

  # GSI4 — Filtros por estado + prioridad.
  # PK = "STATUS#{estado}", SK = "PRIO#{prioridad}#{fecha_inicio}".
  # Permite "todos los abiertos" y "abiertos de alta prioridad" con
  # un solo índice usando begins_with sobre la SK.
  global_secondary_index {
    name            = "GSI4"
    hash_key        = "GSI4-PK"
    range_key       = "GSI4-SK"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = var.ttl_attribute_name
    enabled        = true
  }

  # SSE con CMK customer-managed cuando se provee kms_key_arn (D5 Deliverable
  # B). Si está vacío, AWS usa la default service-managed key. La key policy
  # del módulo kms/ permite Encrypt/Decrypt al service principal dynamodb.*
  # y a las Lambda roles via kms:ViaService.
  server_side_encryption {
    enabled     = true
    kms_key_arn = var.kms_key_arn != "" ? var.kms_key_arn : null
  }

  point_in_time_recovery {
    enabled = var.point_in_time_recovery_enabled
  }

  deletion_protection_enabled = var.deletion_protection_enabled
}
