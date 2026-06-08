// GET /tickets/{id}/messages — devuelve el historial del chat.
// Autorización: caller debe ser solicitante o agente asignado (mismo
// criterio que $connect).
//
// Cada attachment se enriquece con un download_url presigned (5 min). El
// frontend usa el URL directamente para renderizar imágenes y como href
// para descargar otros archivos.

const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const { verifyIdToken } = require("./jwt-verify");
const chatRepo = require("./chat-repo");
const { jsonResponse } = require("./response");

const BUCKET = process.env.ATTACHMENTS_BUCKET_NAME;
const DOWNLOAD_EXPIRES_SECONDS = 300;

const s3 = new S3Client({});

function extractBearer(event) {
  const headers = event.headers || {};
  // API Gateway REST lowercases en multiValueHeaders pero NO en headers; check both casings.
  const raw = headers.Authorization || headers.authorization;
  if (!raw || !raw.startsWith("Bearer ")) return null;
  return raw.slice("Bearer ".length).trim();
}

async function presignDownload(key) {
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return await getSignedUrl(s3, cmd, { expiresIn: DOWNLOAD_EXPIRES_SECONDS });
}

exports.handler = async (event) => {
  const ticketId = event.pathParameters && event.pathParameters.id;
  if (!ticketId) return jsonResponse(400, { error: "missing ticket id" });

  const token = extractBearer(event);
  if (!token) return jsonResponse(401, { error: "missing bearer token" });

  let claims;
  try {
    claims = await verifyIdToken(token);
  } catch (err) {
    console.log("list_messages_jwt_failed", err.message);
    return jsonResponse(401, { error: "invalid token" });
  }

  const ticket = await chatRepo.getTicket(ticketId);
  if (!ticket) return jsonResponse(404, { error: "ticket not found" });

  const sub = claims.sub;
  const isSolicitante = ticket.solicitante && ticket.solicitante.sub === sub;
  const isAssignedAgent =
    ticket.asignado_a && ticket.asignado_a.sub === sub;

  if (!isSolicitante && !isAssignedAgent) {
    return jsonResponse(403, { error: "not a party to this ticket" });
  }

  const items = await chatRepo.listMessagesByTicket(ticketId, 200);

  const messages = await Promise.all(
    items.map(async (m) => {
      const enrichedAttachments = await Promise.all(
        (m.attachments || []).map(async (att) => ({
          ...att,
          download_url: await presignDownload(att.key),
        })),
      );
      return {
        message_id: m.message_id,
        author_id: m.author_id,
        author_name: m.author_name,
        author_role: m.author_role,
        body: m.body,
        attachments: enrichedAttachments,
        created_at: m.created_at,
      };
    }),
  );

  return jsonResponse(200, { ticket_id: ticketId, messages });
};
