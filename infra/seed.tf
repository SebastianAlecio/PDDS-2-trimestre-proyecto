# Este seed se mapea exactamente al schema de la tabla single-table:
#   PK = TICKET#seed-oyd-d3-001 / SK = METADATA
# Con GSI4-PK = STATUS#Abierto y GSI4-SK = PRIO#alta#<fecha>, queda visible
# en el endpoint GET /tickets/queue (que filtra por estado=Abierto).

resource "aws_dynamodb_table_item" "seed_ticket" {
  table_name = module.database.table_name
  hash_key   = "PK"
  range_key  = "SK"

  item = jsonencode({
    PK           = { S = "TICKET#seed-oyd-d3-001" }
    SK           = { S = "METADATA" }
    "GSI1-PK"    = { S = "USER#seed-oyd-d3" }
    "GSI3-PK"    = { S = "TICKETS" }
    "GSI4-PK"    = { S = "STATUS#Abierto" }
    "GSI4-SK"    = { S = "PRIO#alta#2026-06-06T00:00:00.000Z" }
    ticket_id    = { S = "seed-oyd-d3-001" }
    titulo       = { S = "[SEED] Ticket de evidencia OYD-D3" }
    categoria    = { S = "incidente" }
    area         = { S = "IT" }
    prioridad    = { S = "alta" }
    descripcion  = { S = "Item insertado vía Terraform (aws_dynamodb_table_item) para satisfacer el requisito 'Seed Data' del rubric OYD-D3. No representa un ticket real del sistema." }
    estado       = { S = "Abierto" }
    responsable  = { S = "Sin asignar" }
    sla_etiqueta = { S = "1 hora hábil" }
    fecha_inicio = { S = "2026-06-06T00:00:00.000Z" }
    created_at   = { S = "2026-06-06T00:00:00.000Z" }
    updated_at   = { S = "2026-06-06T00:00:00.000Z" }
    fecha_limite = { S = "2026-06-06T01:00:00.000Z" }
    solicitante = { M = {
      nombre  = { S = "Seed User" }
      correo  = { S = "seed@oyd.local" }
      area    = { S = "IT" }
      user_id = { S = "seed-oyd-d3" }
    } }
  })

  lifecycle {
    # Si el handler Lambda modifica el item después del seed (ej. status
    # changes), evitamos que Terraform lo resette en el próximo apply.
    ignore_changes = [item]
  }
}
