// Lambda notifier — consumer de SQS que manda emails vía SES.
//
// Trigger: aws_lambda_event_source_mapping desde la cola ticket-notifications.
// Cada mensaje viene envuelto en la estructura SNS notification (el subscription
// SNS→SQS por default no usa raw_message_delivery), así que el body de la SQS
// record es un JSON que contiene un campo `Message` con el payload original.
//
// Comportamiento ante errores: si SES rechaza el SendEmail (recipient no
// verificado en sandbox, throttle, etc.), el handler tira el error. El
// servicio Lambda reporta failure a SQS, que incrementa el receiveCount y
// vuelve a entregar el mensaje. Después de max_receive_count (3 por default)
// intentos, SQS mueve el mensaje a la DLQ vía la redrive_policy.
//
// IDEMPOTENCIA:
// SQS standard garantiza at-least-once, no exactly-once. Para evitar mandar
// dos veces el mismo email cuando SQS reentrega un mensaje (ej. la Lambda se
// muere después de SES SendEmail success pero antes de devolver), el consumer
// usa un patrón "GET-before-send + PUT-after-send" contra DynamoDB:
//
//   1. Leer el item IDEMPOTENCY#<message_id> de la tabla tickets.
//   2. Si existe → el email ya se mandó, skip.
//   3. Si no existe → ses.SendEmail.
//   4. Tras éxito de SES → PutItem con TTL 7 días (cubre la retención máxima
//      de la cola principal y un margen para investigar).
//
// Race window residual: dos invocaciones concurrentes del mismo message_id
// pueden ambas pasar el GET → ambas mandan. Para SQS standard a low throughput
// (1 mensaje por close de ticket) es muy raro; aceptado para MVP. La
// alternativa sin race es SQS FIFO con MessageDeduplicationId.
//
// El message_id es determinístico desde el producer: ${ticket_id}#${closed_at}.
// Como la ConditionExpression del producer bloquea cerrar dos veces el mismo
// ticket, el message_id siempre es único por evento de negocio real.

const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} = require("@aws-sdk/lib-dynamodb");

const ses = new SESClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const SES_FROM_ADDRESS = process.env.SES_FROM_ADDRESS;
const TABLE_NAME = process.env.TICKETS_TABLE_NAME;

// TTL del idempotency record en segundos. 7 días: cubre la retención máxima
// de la cola principal (4 días) + DLQ (14 días) con buen margen.
const IDEMPOTENCY_TTL_SECONDS = 7 * 24 * 60 * 60;

exports.handler = async (event) => {
  if (!SES_FROM_ADDRESS) {
    throw new Error("SES_FROM_ADDRESS env var no está seteada");
  }
  if (!TABLE_NAME) {
    throw new Error("TICKETS_TABLE_NAME env var no está seteada");
  }

  const records = event.Records || [];
  console.log("notifier_received", JSON.stringify({ count: records.length }));

  for (const record of records) {
    let payload;
    try {
      const snsNotification = JSON.parse(record.body);
      payload = JSON.parse(snsNotification.Message);
    } catch (err) {
      // Mensaje mal formado — no podemos hacer nada útil con él. Lo
      // dejamos fallar para que vaya a DLQ (no es problema transitorio).
      console.error("malformed_message", { body: record.body, err: err.message });
      throw new Error(`malformed SQS message: ${err.message}`);
    }

    if (payload.event !== "ticket.closed") {
      console.log("skipping_unknown_event", { event: payload.event });
      continue;
    }

    const to = payload.solicitante && payload.solicitante.correo;
    if (!to) {
      console.error("missing_recipient", { payload });
      throw new Error("payload missing solicitante.correo");
    }

    // Idempotency key: determinístico desde el payload. Si el producer no
    // mandó message_id (compatibilidad con mensajes viejos), lo derivamos
    // del ticket_id + closed_at — la misma regla que usa el producer.
    const messageId = payload.message_id || `${payload.ticket_id}#${payload.closed_at}`;
    const idempotencyKey = `IDEMPOTENCY#${messageId}`;

    // Paso 1: chequear si este message_id ya fue procesado exitosamente.
    // ConsistentRead garantiza que vemos el último PUT (no la copia eventual
    // de un replica). Costo: el doble de RCUs vs read eventual, irrelevante.
    let alreadyProcessed = false;
    try {
      const existing = await ddb.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: { PK: idempotencyKey, SK: "META" },
          ConsistentRead: true,
        }),
      );
      alreadyProcessed = !!existing.Item;
    } catch (err) {
      console.error("idempotency_get_failed", {
        messageId,
        err: { name: err.name, message: err.message },
      });
      throw err;
    }

    if (alreadyProcessed) {
      console.log("idempotency_skip", { messageId, ticket_id: payload.ticket_id });
      continue;
    }

    // Paso 2: mandar el email.
    const subject = `[Ticke-T] Tu ticket "${payload.titulo}" fue cerrado`;
    const closedByName = (payload.closed_by && payload.closed_by.nombre) || "un agente";
    const text = [
      `Hola ${payload.solicitante.nombre || ""},`,
      ``,
      `Tu ticket ${payload.ticket_id} ("${payload.titulo}") fue cerrado por ${closedByName} el ${payload.closed_at}.`,
      ``,
      `Si tu problema persiste, crea un nuevo ticket desde el portal interno.`,
      ``,
      `— Ticke-T`,
    ].join("\n");

    let sesResult;
    try {
      sesResult = await ses.send(
        new SendEmailCommand({
          Source: SES_FROM_ADDRESS,
          Destination: { ToAddresses: [to] },
          Message: {
            Subject: { Data: subject, Charset: "UTF-8" },
            Body: { Text: { Data: text, Charset: "UTF-8" } },
          },
        }),
      );
      console.log("email_sent", {
        messageId,
        sesMessageId: sesResult.MessageId,
        to,
        ticket_id: payload.ticket_id,
      });
    } catch (err) {
      console.error("ses_send_failed", {
        messageId,
        to,
        ticket_id: payload.ticket_id,
        err: { name: err.name, message: err.message },
      });
      throw err;
    }

    // Paso 3: marcar el message_id como procesado. Si este PUT falla, el
    // email ya se mandó — un retry posterior re-haría el GET, lo vería
    // ausente y mandaría un duplicado. Por eso loggeamos como warning y NO
    // tiramos error: el daño máximo es un email duplicado, vs perder la
    // notificación entera si re-tirásemos.
    const ttlSeconds = Math.floor(Date.now() / 1000) + IDEMPOTENCY_TTL_SECONDS;
    try {
      await ddb.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            PK:           idempotencyKey,
            SK:           "META",
            message_id:   messageId,
            ticket_id:    payload.ticket_id,
            recipient:    to,
            ses_message_id: sesResult.MessageId,
            processed_at: new Date().toISOString(),
            ttl:          ttlSeconds,
          },
        }),
      );
    } catch (err) {
      console.warn("idempotency_put_failed_email_already_sent", {
        messageId,
        err: { name: err.name, message: err.message },
      });
      // No re-tiramos: el email ya está mandado, marcar fue bookkeeping.
    }
  }

  return { batchItemFailures: [] };
};
