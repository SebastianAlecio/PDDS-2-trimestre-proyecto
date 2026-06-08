// POST /tickets/{id}/messages/attachments — devuelve presigned PUT URL.
// El cliente sube el archivo directo a S3 (no pasa por la Lambda), luego
// manda un sendMessage WS con attachments: [{key, filename, content_type,
// size}] referenciando el key devuelto acá.

const { randomUUID } = require("crypto");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const { verifyIdToken } = require("./jwt-verify");
const chatRepo = require("./chat-repo");
const { jsonResponse } = require("./index");

const BUCKET = process.env.ATTACHMENTS_BUCKET_NAME;
const UPLOAD_EXPIRES_SECONDS = 300;
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_CONTENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/json",
  "application/zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const s3 = new S3Client({});

function extractBearer(event) {
  const headers = event.headers || {};
  const raw = headers.Authorization || headers.authorization;
  if (!raw || !raw.startsWith("Bearer ")) return null;
  return raw.slice("Bearer ".length).trim();
}

// Sanitiza el filename: quita path separators, controles, deja solo el
// nombre base. No es seguridad — la key incluye uuid — pero ayuda al
// download a tener un nombre legible.
function safeFilename(input) {
  if (typeof input !== "string" || !input) return "file";
  const base = input.split(/[\\/]/).pop();
  return base.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "file";
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
    console.log("attachment_url_jwt_failed", err.message);
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

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { error: "invalid json" });
  }

  const filename = safeFilename(body.filename);
  const contentType = body.content_type;
  const size = body.size;

  if (!contentType || !ALLOWED_CONTENT_TYPES.has(contentType)) {
    return jsonResponse(415, {
      error: `unsupported content_type: ${contentType || "(missing)"}`,
    });
  }
  if (typeof size !== "number" || size <= 0 || size > MAX_SIZE_BYTES) {
    return jsonResponse(413, {
      error: `size must be 1..${MAX_SIZE_BYTES} bytes`,
    });
  }

  const key = `attachments/${ticketId}/${randomUUID()}-${filename}`;

  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });
  const uploadUrl = await getSignedUrl(s3, cmd, {
    expiresIn: UPLOAD_EXPIRES_SECONDS,
  });

  console.log(
    "attachment_url_issued",
    JSON.stringify({ ticketId, key, contentType, size, sub }),
  );

  return jsonResponse(200, {
    upload_url: uploadUrl,
    key,
    filename,
    content_type: contentType,
    size,
    expires_in: UPLOAD_EXPIRES_SECONDS,
  });
};
