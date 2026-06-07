"use strict";

// Handler unificado para el REST API (payload v1, Lambda proxy) de Ticke-T.
//
// Rutas soportadas:
//   POST /tickets               — crear ticket (solo grupo "colaborador")
//   GET  /tickets/me            — listar mis tickets del colaborador
//   GET  /tickets/queue         — cola para agentes (sin asignar + propios)
//   PUT  /tickets/{id}/assign   — el agente toma el ticket
//
// Autenticación: la valida API Gateway con el authorizer Cognito User Pools;
// si el token no es válido el handler no se invoca. Los claims llegan en
// event.requestContext.authorizer.claims (NO .jwt en REST API v1):
//   - sub          → identificador único del usuario (lo usamos como user_id)
//   - email        → correo verificado
//   - name         → nombre completo
//   - cognito:groups → string "[colaborador agente-n1]" o array
//
// Convención del item ticket:
//   PK     = "TICKET#{ticket_id}"
//   SK     = "METADATA"
//   GSI1-PK = "USER#{sub}"                  → "Mis tickets" del colaborador
//   GSI2-PK = (no se setea al crear)        → cola del agente cuando se asigne
//   GSI3-PK = "TICKETS"                     → reporte gerente
//   GSI4-PK = "STATUS#{estado}"             → filtro por estado
//   GSI4-SK = "PRIO#{prioridad}#{fecha}"    → filtro estado + prioridad

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const crypto = require("node:crypto");
const { 
  CognitoIdentityProviderClient, 
  AdminCreateUserCommand, 
  AdminAddUserToGroupCommand 
} = require("@aws-sdk/client-cognito-identity-provider");


const ALLOWED_CATEGORIES = new Set(["incidente", "solicitud", "mejora"]);
const ALLOWED_AREAS = new Set(["RRHH", "IT", "Legal", "Finanzas"]);
const ALLOWED_PRIORITIES = new Set(["alta", "media", "baja"]);

const SLA_BY_PRIORITY = {
  alta: { hours: 1, label: "1 hora hábil" },
  media: { hours: 4, label: "4 horas hábiles" },
  baja: { hours: 24, label: "1 día hábil" },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TABLE_NAME = process.env.TICKETS_TABLE_NAME;
const ATTACHMENTS_BUCKET = process.env.ATTACHMENTS_BUCKET_NAME;
// Path al que API Gateway mapea el endpoint de health check (default "/health").
// Se setea desde el módulo compute con el valor de var.api_health_check_path.
// El handler matchea contra event.resource (template path) para responder ANTES
// del check de auth — health checks no llevan JWT.
const HEALTH_CHECK_PATH = process.env.HEALTH_CHECK_PATH || "/health";
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const cognitoClient = new CognitoIdentityProviderClient({});

// ────────────────────────────────────────────────────────────────────────────
// Helpers de respuesta HTTP (formato payload v2)
// ────────────────────────────────────────────────────────────────────────────

// CORS: REST API con AWS_PROXY integration no agrega headers CORS automá-
// ticamente — los tiene que devolver la Lambda en cada response, sino el
// browser bloquea con "Failed to fetch". Para errores del authorizer (401,
// 403) que no llegan a la Lambda, los headers se inyectan en gateway_response.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization,Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
};

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    body: JSON.stringify(payload),
  };
}

function ok(payload) {
  return jsonResponse(200, payload);
}

function created(payload) {
  return jsonResponse(201, payload);
}

function badRequest(message, details) {
  return jsonResponse(400, details ? { error: message, details } : { error: message });
}

function unauthorized(message = "unauthorized") {
  return jsonResponse(401, { error: message });
}

function forbidden(message = "forbidden") {
  return jsonResponse(403, { error: message });
}

function notFound(message = "not found") {
  return jsonResponse(404, { error: message });
}

function conflict(message, details) {
  return jsonResponse(409, details ? { error: message, details } : { error: message });
}

function serverError(message, details) {
  return jsonResponse(500, details ? { error: message, details } : { error: message });
}

// ────────────────────────────────────────────────────────────────────────────
// Claims del JWT
// ────────────────────────────────────────────────────────────────────────────

function getClaims(event) {
  // REST API v1 expone los claims del authorizer Cognito directamente bajo
  // requestContext.authorizer.claims (sin .jwt anidado como en HTTP API v2).
  return event?.requestContext?.authorizer?.claims ?? null;
}

// El claim "cognito:groups" puede llegar en varios formatos según el tipo
// de authorizer y el SDK de AWS:
//   - Array de strings (lo más común con COGNITO_USER_POOLS authorizer)
//   - String "[grupo1 grupo2]" con brackets y espacios (HTTP API v2 JWT)
//   - String "grupo1,grupo2" separado por comas (algunos paths de REST API)
// Cubrimos los tres casos para que el handler sea robusto al formato.
function parseGroups(claims) {
  const raw = claims?.["cognito:groups"];
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    const trimmed = raw.replace(/^\[/, "").replace(/\]$/, "").trim();
    if (!trimmed) return [];
    return trimmed.split(/[,\s]+/).filter(Boolean);
  }
  return [];
}

function requireGroup(claims, allowedGroups) {
  const groups = parseGroups(claims);
  return groups.some((g) => allowedGroups.includes(g));
}

// ────────────────────────────────────────────────────────────────────────────
// Validación del body de POST /tickets
// ────────────────────────────────────────────────────────────────────────────

function deriveSla(prioridad, createdAtMs) {
  const spec = SLA_BY_PRIORITY[prioridad];
  return {
    sla_etiqueta: spec.label,
    fecha_limite: new Date(createdAtMs + spec.hours * 3600 * 1000).toISOString(),
  };
}

function validateCreateTicketBody(body) {
  const errors = [];
  if (!body || typeof body !== "object") {
    return ["payload must be a JSON object"];
  }

  const requireNonEmptyString = (key, ref) => {
    const value = ref[key];
    if (typeof value !== "string" || value.trim().length === 0) {
      errors.push(`"${key}" is required and must be a non-empty string`);
    }
  };

  requireNonEmptyString("title", body);
  requireNonEmptyString("description", body);

  if (!ALLOWED_CATEGORIES.has(body.category)) {
    errors.push(`"category" must be one of: ${[...ALLOWED_CATEGORIES].join(", ")}`);
  }
  if (!ALLOWED_AREAS.has(body.area)) {
    errors.push(`"area" must be one of: ${[...ALLOWED_AREAS].join(", ")}`);
  }
  if (!ALLOWED_PRIORITIES.has(body.priority)) {
    errors.push(`"priority" must be one of: ${[...ALLOWED_PRIORITIES].join(", ")}`);
  }

  // El requester ya no se toma del body completo — el handler lo arma desde
  // el JWT. Lo único que aceptamos del body es el área del solicitante,
  // porque Cognito no la conoce (no es un atributo del usuario).
  const requester = body.requester;
  if (!requester || typeof requester !== "object") {
    errors.push(`"requester" is required and must include "area"`);
  } else if (typeof requester.area !== "string" || requester.area.trim().length === 0) {
    errors.push(`"requester.area" is required and must be a non-empty string`);
  }

  if (body.attachments !== undefined) {
    if (!Array.isArray(body.attachments)) {
      errors.push(`"attachments" must be an array when present`);
    } else {
      body.attachments.forEach((a, i) => {
        if (!a || typeof a !== "object") {
          errors.push(`"attachments[${i}]" must be an object`);
          return;
        }
        for (const k of ["id", "name", "type"]) {
          if (typeof a[k] !== "string") {
            errors.push(`"attachments[${i}].${k}" must be a string`);
          }
        }
        if (typeof a.size !== "number" || a.size < 0) {
          errors.push(`"attachments[${i}].size" must be a non-negative number`);
        }
      });
    }
  }

  return errors;
}

// ────────────────────────────────────────────────────────────────────────────
// S3: escritura de metadata de adjuntos
// ────────────────────────────────────────────────────────────────────────────

// TTL del presigned PUT URL: 15 minutos. Suficiente para que el browser
// suba archivos de hasta 25 MB en redes promedio sin que el URL caduque
// en medio del upload.
const PRESIGNED_UPLOAD_TTL_SECONDS = 15 * 60;

// Genera un presigned PUT URL para subir un adjunto DIRECTAMENTE a S3
// desde el browser (sin que el binario pase por Lambda, evitando el límite
// de 6 MB del payload de API Gateway). El URL hereda los permisos IAM de
// la Lambda (s3:PutObject scoped a attachments/*) y es válido por
// PRESIGNED_UPLOAD_TTL_SECONDS. Devuelve { s3_key, url, expires_in }.
//
// IMPORTANTE: el frontend debe hacer PUT con el header Content-Type
// matcheando el `attachment.type` original — si difiere, S3 rechaza con
// 403. Por eso lo bindeamos al PutObjectCommand acá.
async function generatePresignedUploadUrl(ticketId, attachment) {
  if (!ATTACHMENTS_BUCKET) {
    throw new Error("ATTACHMENTS_BUCKET_NAME not set");
  }
  const s3_key = `attachments/${ticketId}/${attachment.id}`;
  const command = new PutObjectCommand({
    Bucket: ATTACHMENTS_BUCKET,
    Key: s3_key,
    ContentType: attachment.type,
  });
  const url = await getSignedUrl(s3, command, {
    expiresIn: PRESIGNED_UPLOAD_TTL_SECONDS,
  });
  return { s3_key, url, expires_in: PRESIGNED_UPLOAD_TTL_SECONDS };
}

// Escribe el manifest completo del ticket a S3 (UNA sola operación PutObject
// por ticket). Esto satisface el requisito literal del rubric OYD-D3
// Deliverable D: "POST /<resource> writes a single object to the team's S3
// bucket". La key es estable y contiene snapshot del item de DynamoDB.
async function writeTicketManifestToS3(ticketId, ticketItem) {
  if (!ATTACHMENTS_BUCKET) {
    return { ok: false, error: "ATTACHMENTS_BUCKET_NAME not set" };
  }
  const s3_key = `attachments/${ticketId}/manifest.json`;
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: ATTACHMENTS_BUCKET,
        Key: s3_key,
        Body: JSON.stringify(ticketItem, null, 2),
        ContentType: "application/json",
      }),
    );
    return { ok: true, s3_key };
  } catch (err) {
    console.error("s3_manifest_write_failed:", {
      bucket: ATTACHMENTS_BUCKET,
      key: s3_key,
      err: { name: err.name, message: err.message },
    });
    return { ok: false, error: err.message };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Handlers por ruta
// ────────────────────────────────────────────────────────────────────────────

async function handleCreateTicket(event, claims) {
  if (!requireGroup(claims, ["colaborador"])) {
    return forbidden("only members of group 'colaborador' can create tickets");
  }

  let body;
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch (err) {
    return badRequest("body is not valid JSON", err.message);
  }

  const errors = validateCreateTicketBody(body);
  if (errors.length > 0) {
    return badRequest("invalid payload", errors);
  }

  // Identidad del solicitante: viene del token, no del body.
  const sub = claims.sub;
  const emailClaim = (claims.email || "").trim().toLowerCase();
  const nameClaim = (claims.name || "").trim();

  if (!sub || !emailClaim || !nameClaim) {
    return unauthorized("token is missing required claims (sub, email, name)");
  }
  if (!EMAIL_RE.test(emailClaim)) {
    return unauthorized("token email is not a valid email address");
  }

  const ticket_id = crypto.randomUUID();
  const nowMs = Date.now();
  const fecha_inicio = new Date(nowMs).toISOString();
  const estado = "Abierto";
  const prioridad = body.priority;

  const { sla_etiqueta, fecha_limite } = deriveSla(prioridad, nowMs);

  // Para cada adjunto generamos un presigned PUT URL. Esto NO escribe el
  // archivo en S3 — solo prepara el path para que el browser lo suba
  // directamente después de recibir la respuesta del POST. El s3_key
  // queda persistido en DynamoDB para que el flujo de descarga pueda
  // generar un presigned GET URL contra esa misma key.
  const rawAttachments = Array.isArray(body.attachments) ? body.attachments : [];
  let uploads = [];
  try {
    uploads = await Promise.all(
      rawAttachments.map((att) => generatePresignedUploadUrl(ticket_id, att)),
    );
  } catch (err) {
    console.error("presign_failed:", err);
    return serverError("failed to generate presigned upload URLs", { message: err.message });
  }

  const enrichedAttachments = rawAttachments.map((att, idx) => ({
    id: att.id,
    name: att.name,
    size: att.size,
    type: att.type,
    s3_key: uploads[idx].s3_key,
    upload_status: "pending", // el frontend lo actualiza a "uploaded" tras el PUT
  }));

  const item = {
    // claves primarias single-table
    PK: `TICKET#${ticket_id}`,
    SK: "METADATA",

    // atributos de los GSIs
    "GSI1-PK": `USER#${sub}`,
    // GSI2-PK se omite intencionalmente: el ticket nace sin agente asignado.
    "GSI3-PK": "TICKETS",
    "GSI4-PK": `STATUS#${estado}`,
    "GSI4-SK": `PRIO#${prioridad}#${fecha_inicio}`,
    fecha_inicio,

    // identificador técnico (convenience)
    ticket_id,

    // atributos de negocio (español)
    titulo: body.title.trim(),
    categoria: body.category,
    area: body.area,
    prioridad,
    descripcion: body.description.trim(),
    estado,
    responsable: "Sin asignar",
    sla_etiqueta,

    // timestamps
    created_at: fecha_inicio,
    updated_at: fecha_inicio,
    fecha_limite,

    // solicitante: identidad del token + área del body
    solicitante: {
      nombre: nameClaim,
      correo: emailClaim,
      area: body.requester.area.trim(),
      user_id: sub,
    },

    adjuntos: enrichedAttachments,
  };

  try {
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    );
  } catch (err) {
    console.error("dynamodb_put_failed:", err);
    return serverError("failed to save ticket", { name: err.name, message: err.message });
  }

  // Escribir el manifest a S3 (single object por POST — requisito OYD-D3).
  // Best-effort: el ticket ya está en DDB, no abortamos por fallo del
  // manifest. Si falta, la evidencia del POST igual incluye el response 201.
  const manifestResult = await writeTicketManifestToS3(ticket_id, item);
  if (!manifestResult.ok) {
    console.warn("manifest_write_failed_continuing:", manifestResult.error);
  }

  console.log("put_success:", JSON.stringify({ id: ticket_id, table: TABLE_NAME, manifest_key: manifestResult.s3_key }));
  return created({
    id: ticket_id,
    item,
    object_key: manifestResult.s3_key || null, // OYD-D3 rubric: "Returns 201 with the object key"
    uploads,                                    // presigned PUT URLs para que el frontend suba cada adjunto
  });
}

async function handleListMyTickets(event, claims) {
  if (!requireGroup(claims, ["colaborador"])) {
    return forbidden("only members of group 'colaborador' can list their own tickets");
  }

  const sub = claims.sub;
  if (!sub) {
    return unauthorized("token is missing 'sub' claim");
  }

  // Limit configurable vía querystring (?limit=N), default 50, máx 100.
  const rawLimit = event.queryStringParameters?.limit;
  let limit = 50;
  if (rawLimit !== undefined) {
    const parsed = Number.parseInt(rawLimit, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return badRequest("'limit' must be a positive integer");
    }
    limit = Math.min(parsed, 100);
  }

  try {
    const result = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "GSI1",
        KeyConditionExpression: "#pk = :user",
        ExpressionAttributeNames: { "#pk": "GSI1-PK" },
        ExpressionAttributeValues: { ":user": `USER#${sub}` },
        ScanIndexForward: false, // más recientes primero
        Limit: limit,
      }),
    );

    return ok({ items: result.Items ?? [], count: result.Count ?? 0 });
  } catch (err) {
    console.error("dynamodb_query_failed:", err);
    return serverError("failed to list tickets", { name: err.name, message: err.message });
  }
}

async function handleQueue(event, claims) {
  if (!requireGroup(claims, ["agente-n1", "agente-n2", "gerente"])) {
    return forbidden("only agentes or gerente can view the queue");
  }

  const sub = claims.sub;
  if (!sub) return unauthorized("token is missing 'sub' claim");

  // Dos queries paralelas:
  //   1. Sin asignar: GSI4 con STATUS#Abierto. Al tomar el ticket pasamos a
  //      STATUS#En progreso, así que esta lista contiene solo los disponibles.
  //   2. Míos: GSI2 con AGENT#{sub}, filtrando fuera Resuelto/Cerrado para
  //      que la cola no se llene de historial.
  try {
    const [unassignedResult, mineResult] = await Promise.all([
      ddb.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: "GSI4",
          KeyConditionExpression: "#pk = :status",
          ExpressionAttributeNames: { "#pk": "GSI4-PK" },
          ExpressionAttributeValues: { ":status": "STATUS#Abierto" },
          ScanIndexForward: true, // por SK = PRIO#<p>#<fecha>, ordena alta primero
          Limit: 100,
        }),
      ),
      ddb.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: "GSI2",
          KeyConditionExpression: "#pk = :agent",
          FilterExpression: "estado <> :done AND estado <> :closed",
          ExpressionAttributeNames: { "#pk": "GSI2-PK" },
          ExpressionAttributeValues: {
            ":agent": `AGENT#${sub}`,
            ":done": "Resuelto",
            ":closed": "Cerrado",
          },
          ScanIndexForward: false, // por fecha_inicio, más recientes primero
          Limit: 100,
        }),
      ),
    ]);

    return ok({
      unassigned: unassignedResult.Items ?? [],
      mine: mineResult.Items ?? [],
    });
  } catch (err) {
    console.error("dynamodb_queue_query_failed:", err);
    return serverError("failed to load queue", { name: err.name, message: err.message });
  }
}

async function handleAssignTicket(event, claims) {
  if (!requireGroup(claims, ["agente-n1", "agente-n2"])) {
    return forbidden("only agentes can take tickets");
  }

  const sub = claims.sub;
  const nameClaim = (claims.name || "").trim();
  if (!sub || !nameClaim) {
    return unauthorized("token is missing 'sub' or 'name' claim");
  }

  const ticketId = event.pathParameters?.id;
  if (!ticketId) {
    return badRequest("missing path parameter 'id'");
  }

  const nowIso = new Date().toISOString();
  const newStatus = "En progreso";
  const agentPk = `AGENT#${sub}`;

  // Condición: el ticket existe Y (no tiene agente asignado O ya está
  // asignado a mí — idempotencia). Si ya lo tomó otro, falla con 409.
  try {
    const result = await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `TICKET#${ticketId}`, SK: "METADATA" },
        UpdateExpression:
          "SET #g2pk = :agent, #g4pk = :statusPk, estado = :status, responsable = :name, updated_at = :now",
        ConditionExpression:
          "attribute_exists(PK) AND (attribute_not_exists(#g2pk) OR #g2pk = :agent)",
        ExpressionAttributeNames: {
          "#g2pk": "GSI2-PK",
          "#g4pk": "GSI4-PK",
        },
        ExpressionAttributeValues: {
          ":agent": agentPk,
          ":statusPk": `STATUS#${newStatus}`,
          ":status": newStatus,
          ":name": nameClaim,
          ":now": nowIso,
        },
        ReturnValues: "ALL_NEW",
      }),
    );
    return ok({ id: ticketId, item: result.Attributes });
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      // Puede ser que el ticket no existe O que ya fue tomado por otro
      // agente. Distinguimos con un GetItem rápido para devolver el código
      // correcto al frontend.
      try {
        const probe = await ddb.send(
          new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: "PK = :pk AND SK = :sk",
            ExpressionAttributeValues: {
              ":pk": `TICKET#${ticketId}`,
              ":sk": "METADATA",
            },
            Limit: 1,
          }),
        );
        if (!probe.Items || probe.Items.length === 0) {
          return notFound(`ticket ${ticketId} does not exist`);
        }
        const existing = probe.Items[0];
        return conflict("ticket already assigned to another agent", {
          responsable: existing.responsable ?? "otro agente",
        });
      } catch (probeErr) {
        console.error("assign_probe_failed:", probeErr);
        return conflict("ticket already assigned or does not exist");
      }
    }
    console.error("dynamodb_assign_failed:", err);
    return serverError("failed to assign ticket", { name: err.name, message: err.message });
  }
}

async function handleCreateUser(event, claims) {
  if (!requireGroup(claims, ["gerente"])) {
    return forbidden("No tienes permisos para crear usuarios. Solo los gerentes pueden hacerlo.");
  }

  try {
    const body = JSON.parse(event.body);
    const { email, name, role } = body;

    // Validación básica de parámetros
    if (!email || !name || !role) {
      return badRequest("Faltan campos obligatorios: email, name, role.");
    }
    
    // Asegúrate de inyectar el ID de tu User Pool a la Lambda desde tu archivo Terraform
    const userPoolId = process.env.COGNITO_USER_POOL_ID; 

    if (!userPoolId) {
      throw new Error("Variable COGNITO_USER_POOL_ID no definida en el entorno");
    }

    // 2. Crear el usuario en Cognito.
    // DesiredDeliveryMediums: ["EMAIL"] es el parámetro encargado de enviar la contraseña
    // temporal automáticamente al correo del usuario.
    const createCommand = new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: email,
      UserAttributes: [
        { Name: "email", Value: email },
        { Name: "email_verified", Value: "true" },
        { Name: "name", Value: name }
      ],
      DesiredDeliveryMediums: ["EMAIL"] 
    });

    await cognitoClient.send(createCommand);

    // 3. Asignar el rol al usuario dentro del grupo de Cognito.
    // El rol enviado debe hacer 'match' con los nombres de tus grupos 
    // en aws_cognito_user_group ("colaborador", "agente-n1", "agente-n2", "gerente")
    const addToGroupCommand = new AdminAddUserToGroupCommand({
      UserPoolId: userPoolId,
      Username: email,
      GroupName: role
    });

    await cognitoClient.send(addToGroupCommand);

    // 4. Retornar Respuesta Exitosa (201)
    return {
      statusCode: 201,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*" 
      },
      body: JSON.stringify({ message: "Usuario creado exitosamente y asignado al rol." })
    };

  } catch (error) {
    console.error("Error al crear usuario en Cognito:", error);
    
    // Manejo de Error: Cognito devuelve "UsernameExistsException" si el correo ya fue registrado
    if (error.name === "UsernameExistsException") {
      return {
        statusCode: 409,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "El usuario o correo ingresado ya existe en el sistema." })
      };
    }

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Error interno al crear el usuario." })
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Router
// ────────────────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  // REST API v1 no tiene event.routeKey: se compone con httpMethod + resource.
  // resource trae el path como template ("/tickets/{id}/assign"), no el path
  // concreto ("/tickets/abc-123/assign") — ideal para usar como route key.
  const routeKey = `${event.httpMethod} ${event.resource}`;
  console.log("event:", JSON.stringify({ routeKey, requestId: event.requestContext?.requestId }));

  // Health check: responde antes del auth check para que load balancers y
  // monitores externos puedan hacer probes sin enviar JWT. Verifica que el
  // runtime de la Lambda está vivo y reporta el estado de las env vars
  // críticas (sin tocar DDB/S3 para no consumir capacidad por probe).
  if (event.httpMethod === "GET" && event.resource === HEALTH_CHECK_PATH) {
    return handleHealthCheck();
  }

  if (!TABLE_NAME) {
    return serverError("server misconfigured: TICKETS_TABLE_NAME is not set");
  }

  const claims = getClaims(event);
  if (!claims) {
    // No debería ocurrir si la integración está bien configurada (el authorizer
    // bloquea antes), pero defendemos para no procesar requests sin identidad.
    return unauthorized("missing JWT claims");
  }

  switch (routeKey) {
    case "POST /tickets":
      return handleCreateTicket(event, claims);

    case "GET /tickets/me":
      return handleListMyTickets(event, claims);

    case "GET /tickets/queue":
      return handleQueue(event, claims);

    case "PUT /tickets/{id}/assign":
      return handleAssignTicket(event, claims);

    case "POST /users":
      return handleCreateUser(event, claims);

    default:
      return notFound(`route ${routeKey} is not handled`);
  }
};

// Liveness probe: confirma que la Lambda está corriendo y que las env vars
// críticas están seteadas. No hace I/O contra DDB/S3 para mantener el probe
// barato y aislado de fallas de dependencias (eso sería un readiness check
// separado, fuera del scope de esta entrega).
function handleHealthCheck() {
  return ok({
    status: "ok",
    service: process.env.AWS_LAMBDA_FUNCTION_NAME || "unknown",
    region: process.env.AWS_REGION || "unknown",
    timestamp: new Date().toISOString(),
    dependencies: {
      tickets_table: TABLE_NAME ? "configured" : "missing",
      attachments_bucket: ATTACHMENTS_BUCKET ? "configured" : "missing",
    },
  });
}
