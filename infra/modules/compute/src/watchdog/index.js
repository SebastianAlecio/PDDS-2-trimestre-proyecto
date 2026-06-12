const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");

const dbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dbClient);
const snsClient = new SNSClient({});

exports.handler = async (event) => {
  const tableName = process.env.TICKETS_TABLE_NAME;
  const snsTopicArn = process.env.SNS_TOPIC_ARN;
  const now = new Date().toISOString();

  console.log("Iniciando validación de SLA...", { timestamp: now });

  try {
    // 1. Consultar tickets Abiertos. 
    // Asumiendo que GSI4 agrupa por estado en "GSI4-PK" = "STATUS#<estado>"
    const queryParams = {
      TableName: tableName,
      IndexName: "GSI4", // Reemplazar por el nombre real del índice de estado si es diferente
      KeyConditionExpression: "#gsi_pk = :estado_abierto",
      FilterExpression: "fecha_limite <= :now",
      ExpressionAttributeNames: {
        "#gsi_pk": "GSI4-PK"
      },
      ExpressionAttributeValues: {
        ":estado_abierto": "STATUS#Abierto",
        ":now": now
      }
    };

    const { Items: ticketsVencidos } = await docClient.send(new QueryCommand(queryParams));

    if (!ticketsVencidos || ticketsVencidos.length === 0) {
      console.log("No se encontraron tickets con SLA vencido.");
      return;
    }

    console.log(`Encontrados ${ticketsVencidos.length} tickets vencidos. Iniciando procesamiento.`);

    // 2. Procesar cada ticket vencido
    for (const ticket of ticketsVencidos) {
      try {
        // 2.a. Actualizar estado del ticket a Vencido
        await docClient.send(new UpdateCommand({
          TableName: tableName,
          Key: { PK: ticket.PK, SK: ticket.SK },
          UpdateExpression: "SET estado = :nuevo_estado, #gsi_pk = :nuevo_gsi_pk, updated_at = :now",
          // ConditionExpression previene que procesemos el ticket dos veces si otro proceso ya lo cerró
          ConditionExpression: "estado = :estado_actual",
          ExpressionAttributeNames: {
            "#gsi_pk": "GSI4-PK"
          },
          ExpressionAttributeValues: {
            ":nuevo_estado": "Vencido",
            ":nuevo_gsi_pk": "STATUS#Vencido",
            ":now": now,
            ":estado_actual": "Abierto"
          }
        }));

        // 2.b. Publicar el evento en SNS
        const payload = {
          event: "ticket.expired",
          ticket_id: ticket.PK.replace("TICKET#", ""),
          titulo: ticket.titulo,
          solicitante: ticket.solicitante,
          responsable: ticket.responsable, // Útil para enviarle el correo al agente
          expired_at: now
        };

        await snsClient.send(new PublishCommand({
          TopicArn: snsTopicArn,
          Message: JSON.stringify(payload)
        }));

        console.log(`Ticket ${ticket.PK} marcado como Vencido y evento publicado en SNS.`);
      } catch (err) {
        if (err.name === "ConditionalCheckFailedException") {
          console.warn(`El ticket ${ticket.PK} ya no está Abierto. Saltando...`);
        } else {
          console.error(`Error procesando ticket ${ticket.PK}:`, err);
          // Continuamos con los demás tickets aunque este haya fallado
        }
      }
    }
  } catch (error) {
    console.error("Error general ejecutando el watchdog de SLA:", error);
    throw error; // Lanzar para que CloudWatch capture el fallo de la ejecución
  }
};
