// Watchdog de SLA — corre vía aws_scheduler_schedule (cada hora). Por cada
// invocación scanea tickets `Abierto` cuyo fecha_limite ya pasó y:
//   1) Marca el ticket como `Vencido` en DynamoDB (con condition para
//      evitar dobles updates si otra ejecución entra concurrente).
//   2) Encola un mensaje `ticket.expired` en la cola SQS del módulo
//      async/ — el async_consumer Lambda lo procesa: escribe audit log
//      a S3 + manda email al solicitante vía SES.
//
// Por qué SQS directo (NO SNS): este flow es 1:1 (un único consumer),
// no necesita el fan-out de SNS. El flow del `ticket.closed` SÍ usa
// SNS+notifier porque está documentado en el doc del curso Cloud E4 y
// abre la puerta a múltiples suscriptores a futuro.

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");

const TABLE_NAME = process.env.TICKETS_TABLE_NAME;
const ASYNC_QUEUE_URL = process.env.ASYNC_QUEUE_URL;

if (!TABLE_NAME) throw new Error("TICKETS_TABLE_NAME es requerido");
if (!ASYNC_QUEUE_URL) throw new Error("ASYNC_QUEUE_URL es requerido");

const dbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dbClient);
const sqsClient = new SQSClient({});

exports.handler = async () => {
  const now = new Date().toISOString();
  console.log("watchdog_start", { timestamp: now });

  let ticketsVencidos = [];
  try {
    const res = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "GSI4",
        KeyConditionExpression: "#gsi_pk = :estado_abierto",
        FilterExpression: "fecha_limite <= :now",
        ExpressionAttributeNames: { "#gsi_pk": "GSI4-PK" },
        ExpressionAttributeValues: {
          ":estado_abierto": "STATUS#Abierto",
          ":now": now,
        },
      }),
    );
    ticketsVencidos = res.Items || [];
  } catch (err) {
    console.error("watchdog_query_failed", { name: err.name, message: err.message });
    throw err;
  }

  if (ticketsVencidos.length === 0) {
    console.log("watchdog_no_expired_tickets");
    return;
  }

  console.log("watchdog_processing", { count: ticketsVencidos.length });

  for (const ticket of ticketsVencidos) {
    try {
      // 1) UpdateItem con condition: solo procesa si todavía está Abierto.
      // Si otro run (o el agente cerrándolo manual) ya cambió el estado,
      // la condition falla y skipeamos.
      await docClient.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { PK: ticket.PK, SK: ticket.SK },
          UpdateExpression:
            "SET estado = :nuevo_estado, #gsi_pk = :nuevo_gsi_pk, updated_at = :now",
          ConditionExpression: "estado = :estado_actual",
          ExpressionAttributeNames: { "#gsi_pk": "GSI4-PK" },
          ExpressionAttributeValues: {
            ":nuevo_estado": "Vencido",
            ":nuevo_gsi_pk": "STATUS#Vencido",
            ":now": now,
            ":estado_actual": "Abierto",
          },
        }),
      );

      // 2) Encolar evento `ticket.expired` al async queue. Consumer
      // se encarga de audit log + email.
      const payload = {
        event: "ticket.expired",
        ticket_id: ticket.PK.replace("TICKET#", ""),
        titulo: ticket.titulo,
        solicitante: ticket.solicitante,
        responsable: ticket.responsable,
        prioridad: ticket.prioridad,
        sla_etiqueta: ticket.sla_etiqueta,
        fecha_limite: ticket.fecha_limite,
        expired_at: now,
      };

      const sendRes = await sqsClient.send(
        new SendMessageCommand({
          QueueUrl: ASYNC_QUEUE_URL,
          MessageBody: JSON.stringify(payload),
        }),
      );

      console.log("watchdog_ticket_expired", {
        ticket_id: payload.ticket_id,
        message_id: sendRes.MessageId,
      });
    } catch (err) {
      if (err.name === "ConditionalCheckFailedException") {
        console.warn("watchdog_ticket_skipped_not_abierto", { ticket_pk: ticket.PK });
      } else {
        console.error("watchdog_ticket_failed", {
          ticket_pk: ticket.PK,
          name: err.name,
          message: err.message,
        });
        // Seguimos con los demás — un ticket roto no debe bloquear el resto.
      }
    }
  }

  console.log("watchdog_done", { count: ticketsVencidos.length });
};
