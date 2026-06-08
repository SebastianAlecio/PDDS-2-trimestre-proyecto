// Helpers DDB para el dominio chat. Centraliza el schema (PK/SK conventions)
// para que los handlers no construyan keys ad-hoc.

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  DeleteCommand,
} = require("@aws-sdk/lib-dynamodb");

const TABLE_NAME = process.env.TICKETS_TABLE_NAME;
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const CONN_TTL_SECONDS = 24 * 60 * 60; // 24h

function ttlNowPlusDay() {
  return Math.floor(Date.now() / 1000) + CONN_TTL_SECONDS;
}

// Trae metadata del ticket.
async function getTicket(ticketId) {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `TICKET#${ticketId}`, SK: "METADATA" },
    }),
  );
  return res.Item || null;
}

// Persiste una conexión con DOS items: uno bajo la partición del ticket
// (para listar todas las conexiones de ese ticket en broadcast) y uno bajo
// la partición de la conexión (para que $disconnect resuelva qué ticket).
async function registerConnection({ ticketId, connectionId, user }) {
  const ttl = ttlNowPlusDay();
  const connectedAt = new Date().toISOString();

  await Promise.all([
    ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `TICKET#${ticketId}`,
          SK: `CONN#${connectionId}`,
          connection_id: connectionId,
          user_id: user.sub,
          user_name: user.name,
          role: user.role,
          connected_at: connectedAt,
          ttl,
        },
      }),
    ),
    ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `CONN#${connectionId}`,
          SK: "META",
          ticket_id: ticketId,
          user_id: user.sub,
          ttl,
        },
      }),
    ),
  ]);
}

// $disconnect solo recibe connectionId. Para borrar el item-target del
// broadcast (bajo TICKET#<id>) primero necesitamos saber a qué ticket
// pertenecía esta conexión.
async function getConnectionMeta(connectionId) {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `CONN#${connectionId}`, SK: "META" },
    }),
  );
  return res.Item || null;
}

async function removeConnection({ ticketId, connectionId }) {
  // Best-effort: si alguno ya no existe (race con $connect, TTL), no rompe.
  await Promise.all([
    ddb.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { PK: `TICKET#${ticketId}`, SK: `CONN#${connectionId}` },
      }),
    ),
    ddb.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { PK: `CONN#${connectionId}`, SK: "META" },
      }),
    ),
  ]);
}

async function listConnectionsByTicket(ticketId) {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: {
        ":pk": `TICKET#${ticketId}`,
        ":prefix": "CONN#",
      },
    }),
  );
  return res.Items || [];
}

async function putMessage({ ticketId, messageId, body, attachments, author }) {
  const createdAt = new Date().toISOString();
  const sk = `MSG#${createdAt}#${messageId}`;
  const item = {
    PK: `TICKET#${ticketId}`,
    SK: sk,
    message_id: messageId,
    author_id: author.sub,
    author_name: author.name,
    author_role: author.role,
    body,
    attachments: attachments || [],
    created_at: createdAt,
  };
  try {
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
        // Si el cliente re-emite el mismo message_id (retry), el SK exacto
        // ya existe → falla → handler retorna echo del item original.
        ConditionExpression: "attribute_not_exists(SK)",
      }),
    );
    return { item, isNew: true };
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      // Mensaje ya estaba persistido. Leerlo y devolverlo igual.
      const existing = await ddb.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: { PK: `TICKET#${ticketId}`, SK: sk },
        }),
      );
      return { item: existing.Item, isNew: false };
    }
    throw err;
  }
}

async function listMessagesByTicket(ticketId, limit = 50) {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: {
        ":pk": `TICKET#${ticketId}`,
        ":prefix": "MSG#",
      },
      Limit: limit,
      ScanIndexForward: true, // chronological order
    }),
  );
  return res.Items || [];
}

module.exports = {
  getTicket,
  registerConnection,
  getConnectionMeta,
  removeConnection,
  listConnectionsByTicket,
  putMessage,
  listMessagesByTicket,
};
