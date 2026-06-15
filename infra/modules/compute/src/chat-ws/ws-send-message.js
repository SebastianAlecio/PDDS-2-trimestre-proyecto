// sendMessage handler. Recibe el body que el cliente mandó por WS, persiste
// el mensaje en DDB y hace broadcast a todas las conexiones del ticket.
//
// Broadcast pattern: PostToConnection a cada connection_id del ticket. Si
// AWS devuelve 410 GoneException, esa connection cerró sin que llegara
// $disconnect (cliente cerró abruptamente). Limpiamos best-effort.

const { randomUUID } = require("crypto");
const {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} = require("@aws-sdk/client-apigatewaymanagementapi");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
} = require("@aws-sdk/lib-dynamodb");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const chatRepo = require("./chat-repo");

const TABLE_NAME = process.env.TICKETS_TABLE_NAME;
const WS_ENDPOINT = process.env.WEBSOCKET_API_ENDPOINT;
const ATTACHMENTS_BUCKET = process.env.ATTACHMENTS_BUCKET_NAME;
const DOWNLOAD_TTL_SECONDS = 300;

if (!WS_ENDPOINT) {
  throw new Error("WEBSOCKET_API_ENDPOINT es requerido");
}

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const wsClient = new ApiGatewayManagementApiClient({ endpoint: WS_ENDPOINT });

// Firma presigned GET URLs para cada attachment del mensaje. Los clientes
// reciben las URLs en el broadcast y pueden renderizar imágenes inline
// sin un round-trip extra al refetch del history.
async function enrichAttachmentsWithUrls(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) return [];
  if (!ATTACHMENTS_BUCKET) return attachments;
  return await Promise.all(
    attachments.map(async (a) => {
      if (!a || typeof a.key !== "string") return a;
      try {
        const url = await getSignedUrl(
          s3,
          new GetObjectCommand({ Bucket: ATTACHMENTS_BUCKET, Key: a.key }),
          { expiresIn: DOWNLOAD_TTL_SECONDS },
        );
        return { ...a, download_url: url };
      } catch (err) {
        console.warn(
          "ws_send_message_presign_failed",
          JSON.stringify({ key: a.key, name: err.name }),
        );
        return a;
      }
    }),
  );
}

// Lee el item de conexión bajo TICKET#<id>/CONN#<connId>. Tiene user_id,
// user_name y role — los necesitamos para autoría del mensaje sin pegarle a
// Cognito.
async function getConnectionItem(ticketId, connectionId) {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `TICKET#${ticketId}`, SK: `CONN#${connectionId}` },
    }),
  );
  return res.Item || null;
}

function parseBody(rawBody) {
  try {
    return JSON.parse(rawBody || "{}");
  } catch {
    return null;
  }
}

function normalizeAttachments(input) {
  if (!Array.isArray(input)) return [];
  return input
    .filter((a) => a && typeof a === "object" && typeof a.key === "string")
    .map((a) => ({
      key: a.key,
      content_type: a.content_type || "application/octet-stream",
      filename: a.filename || a.key.split("/").pop(),
      size: typeof a.size === "number" ? a.size : null,
    }));
}

exports.handler = async (event) => {
  const connectionId = event.requestContext.connectionId;
  const meta = await chatRepo.getConnectionMeta(connectionId);
  if (!meta) {
    console.log(
      "ws_send_message_meta_missing",
      JSON.stringify({ connectionId }),
    );
    return { statusCode: 410, body: "connection unknown" };
  }
  const ticketId = meta.ticket_id;

  const payload = parseBody(event.body);
  if (!payload) {
    return { statusCode: 400, body: "invalid json" };
  }

  const rawText = typeof payload.body === "string" ? payload.body.trim() : "";
  const attachments = normalizeAttachments(payload.attachments);

  if (!rawText && attachments.length === 0) {
    return { statusCode: 400, body: "message body or attachments required" };
  }

  const messageId = payload.message_id || randomUUID();

  const connItem = await getConnectionItem(ticketId, connectionId);
  if (!connItem) {
    console.log(
      "ws_send_message_conn_item_missing",
      JSON.stringify({ ticketId, connectionId }),
    );
    return { statusCode: 410, body: "connection unknown" };
  }

  const author = {
    sub: connItem.user_id,
    name: connItem.user_name,
    role: connItem.role,
  };

  const { item } = await chatRepo.putMessage({
    ticketId,
    messageId,
    body: rawText,
    attachments,
    author,
  });

  // Broadcast — enriquecemos attachments con presigned GET URLs antes de
  // serializar para que los receptores rendericen imágenes inline.
  const connections = await chatRepo.listConnectionsByTicket(ticketId);
  const enrichedAttachments = await enrichAttachmentsWithUrls(item.attachments);
  const wsPayload = JSON.stringify({
    type: "message",
    ticket_id: ticketId,
    message: {
      message_id: item.message_id,
      author_id: item.author_id,
      author_name: item.author_name,
      author_role: item.author_role,
      body: item.body,
      attachments: enrichedAttachments,
      created_at: item.created_at,
    },
  });

  await Promise.all(
    connections.map(async (c) => {
      try {
        await wsClient.send(
          new PostToConnectionCommand({
            ConnectionId: c.connection_id,
            Data: Buffer.from(wsPayload),
          }),
        );
      } catch (err) {
        if (err.name === "GoneException" || err.$metadata?.httpStatusCode === 410) {
          console.log(
            "ws_send_message_gone_cleanup",
            JSON.stringify({ ticketId, connectionId: c.connection_id }),
          );
          await chatRepo
            .removeConnection({ ticketId, connectionId: c.connection_id })
            .catch((e) =>
              console.error("ws_send_message_cleanup_failed", e),
            );
          return;
        }
        console.error(
          "ws_send_message_post_failed",
          JSON.stringify({ connectionId: c.connection_id, name: err.name }),
        );
      }
    }),
  );

  console.log(
    "ws_send_message_ok",
    JSON.stringify({
      ticketId,
      messageId: item.message_id,
      authorSub: author.sub,
      connections: connections.length,
    }),
  );

  return { statusCode: 200, body: "OK" };
};
