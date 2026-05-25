"use strict";

// Handler de creación de tickets para la tabla single-table SoporteTickets.
//
// Recibe el ticket por event (invocación directa vía `aws lambda invoke`),
// valida los campos, mapea los nombres del input (inglés, igual que como
// los manda el frontend) a atributos en español del item, calcula los
// atributos de los GSIs y persiste con PutItem.
//
// Sin HTTP endpoint todavía; ese paso viene en E3.
//
// Convención del item:
//   PK     = "TICKET#{ticket_id}"
//   SK     = "METADATA"
//   GSI1-PK = "USER#{user_id}"              → "Mis tickets" del colaborador
//   GSI2-PK = (no se setea al crear)        → cola del agente cuando se asigne
//   GSI3-PK = "TICKETS"                     → reporte gerente
//   GSI4-PK = "STATUS#{estado}"             → filtro por estado
//   GSI4-SK = "PRIO#{prioridad}#{fecha}"    → filtro estado + prioridad

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const crypto = require("node:crypto");

const ALLOWED_CATEGORIES = new Set(["incidente", "solicitud", "mejora"]);
const ALLOWED_AREAS = new Set(["RRHH", "IT", "Legal", "Finanzas"]);
const ALLOWED_PRIORITIES = new Set(["alta", "media", "baja"]);

const SLA_BY_PRIORITY = {
  alta: { hours: 1, label: "1 hora hábil" },
  media: { hours: 4, label: "4 horas hábiles" },
  baja: { hours: 24, label: "1 día hábil" },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function fail(message, details) {
  return details
    ? { ok: false, error: message, details }
    : { ok: false, error: message };
}

function deriveSla(prioridad, createdAtMs) {
  const spec = SLA_BY_PRIORITY[prioridad];
  return {
    sla_etiqueta: spec.label,
    fecha_limite: new Date(createdAtMs + spec.hours * 3600 * 1000).toISOString(),
  };
}

function validateInput(event) {
  const errors = [];
  if (!event || typeof event !== "object") {
    return ["payload must be a JSON object"];
  }

  const requireNonEmptyString = (key, ref) => {
    const value = ref[key];
    if (typeof value !== "string" || value.trim().length === 0) {
      errors.push(`"${key}" is required and must be a non-empty string`);
    }
  };

  requireNonEmptyString("title", event);
  requireNonEmptyString("description", event);

  if (!ALLOWED_CATEGORIES.has(event.category)) {
    errors.push(
      `"category" must be one of: ${[...ALLOWED_CATEGORIES].join(", ")}`,
    );
  }
  if (!ALLOWED_AREAS.has(event.area)) {
    errors.push(`"area" must be one of: ${[...ALLOWED_AREAS].join(", ")}`);
  }
  if (!ALLOWED_PRIORITIES.has(event.priority)) {
    errors.push(
      `"priority" must be one of: ${[...ALLOWED_PRIORITIES].join(", ")}`,
    );
  }

  const r = event.requester;
  if (!r || typeof r !== "object") {
    errors.push(
      `"requester" is required and must include name/email/area/user_id`,
    );
  } else {
    for (const k of ["name", "email", "area", "user_id"]) {
      if (typeof r[k] !== "string" || r[k].trim().length === 0) {
        errors.push(`"requester.${k}" is required`);
      }
    }
    if (typeof r.email === "string" && !EMAIL_RE.test(r.email.trim())) {
      errors.push(`"requester.email" must be a valid email address`);
    }
  }

  if (event.attachments !== undefined) {
    if (!Array.isArray(event.attachments)) {
      errors.push(`"attachments" must be an array when present`);
    } else {
      event.attachments.forEach((a, i) => {
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

exports.handler = async (event) => {
  console.log("event:", JSON.stringify(event));

  const errors = validateInput(event);
  if (errors.length > 0) {
    const response = fail("invalid payload", errors);
    console.log("validation_failed:", JSON.stringify(response));
    return response;
  }

  const tableName = process.env.TICKETS_TABLE_NAME;
  if (!tableName) {
    const response = fail("server misconfigured: TICKETS_TABLE_NAME is not set");
    console.error(response);
    return response;
  }

  const ticket_id = crypto.randomUUID();
  const nowMs = Date.now();
  const fecha_inicio = new Date(nowMs).toISOString();
  const estado = "Abierto";
  const prioridad = event.priority;

  const { sla_etiqueta, fecha_limite } = deriveSla(prioridad, nowMs);

  const item = {
    // claves primarias single-table
    PK: `TICKET#${ticket_id}`,
    SK: "METADATA",

    // atributos de los GSIs
    "GSI1-PK": `USER#${event.requester.user_id.trim()}`,
    // GSI2-PK se omite intencionalmente: el ticket nace sin agente.
    "GSI3-PK": "TICKETS",
    "GSI4-PK": `STATUS#${estado}`,
    "GSI4-SK": `PRIO#${prioridad}#${fecha_inicio}`,
    fecha_inicio,

    // identificador técnico (convenience)
    ticket_id,

    // atributos de negocio (español)
    titulo: event.title.trim(),
    categoria: event.category,
    area: event.area,
    prioridad,
    descripcion: event.description.trim(),
    estado,
    responsable: "Sin asignar",
    sla_etiqueta,

    // timestamps
    created_at: fecha_inicio,
    updated_at: fecha_inicio,
    fecha_limite,

    // solicitante (atributos humanos traducidos; user_id intacto)
    solicitante: {
      nombre: event.requester.name.trim(),
      correo: event.requester.email.trim().toLowerCase(),
      area: event.requester.area.trim(),
      user_id: event.requester.user_id.trim(),
    },

    adjuntos: Array.isArray(event.attachments) ? event.attachments : [],
  };

  try {
    await ddb.send(
      new PutCommand({
        TableName: tableName,
        Item: item,
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    );
  } catch (err) {
    console.error("dynamodb_put_failed:", err);
    return fail("failed to save ticket", {
      name: err.name,
      message: err.message,
    });
  }

  const response = { ok: true, id: ticket_id, item };
  console.log(
    "put_success:",
    JSON.stringify({ ok: true, id: ticket_id, table: tableName }),
  );
  return response;
};
