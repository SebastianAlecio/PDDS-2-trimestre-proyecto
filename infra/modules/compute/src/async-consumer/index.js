"use strict";

// Async consumer Lambda — disparada por aws_lambda_event_source_mapping
// desde la cola del módulo async/. Por cada record SQS:
//   1. Parsea el body JSON.
//   2. Escribe UN objeto a S3 (prefijo async-events/<message_id>.json)
//      con el payload completo + metadata de procesamiento. Audit log
//      durable — requisito del rubric OYD-D4 Deliverable E.
//   3. Loggea el messageId — requisito explícito del rubric ("the
//      consumer must log the processed message ID").
//   4. Si el payload tiene event === "ticket.expired", manda email al
//      solicitante vía SES avisándole que su ticket venció el SLA. Si
//      event es otro (o no hay), solo el audit log queda persistido.
//
// Si el handler tira, SQS reentrega el record hasta max_receive_count
// veces; después SQS lo mueve a la DLQ vía redrive_policy. Esa cadena
// evita que un bug del consumer descarte mensajes silenciosamente.

const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

const BUCKET = process.env.ASYNC_BUCKET_NAME;
const KEY_PREFIX = process.env.ASYNC_BUCKET_KEY_PREFIX || "async-events/";
const SES_FROM_ADDRESS = process.env.SES_FROM_ADDRESS || "";

if (!BUCKET) {
  // Lanzamos en init — Lambda reusa containers warm, así que el error
  // aparece en CloudWatch al primer trigger y el deploy queda evidente
  // como roto en vez de fallar silenciosamente record por record.
  throw new Error("ASYNC_BUCKET_NAME es requerido");
}

const s3 = new S3Client({});
const ses = new SESClient({});

exports.handler = async (event) => {
  const records = (event && event.Records) || [];
  if (records.length === 0) {
    console.log("async_consumer_no_records");
    return;
  }

  for (const record of records) {
    const messageId = record.messageId;
    let payload;
    try {
      payload = JSON.parse(record.body || "{}");
    } catch (err) {
      console.error("async_consumer_invalid_json", {
        messageId,
        error: err.message,
      });
      throw err;
    }

    // Paso 1 — audit log: escribir SIEMPRE a S3, sin importar event type.
    // Eso garantiza trazabilidad durable de TODOS los mensajes (incluso
    // los de testing con curl) que pasaron por la cola.
    const objectKey = `${KEY_PREFIX}${messageId}.json`;
    const processedAt = new Date().toISOString();
    const body = JSON.stringify(
      { message_id: messageId, processed_at: processedAt, payload },
      null,
      2,
    );

    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: objectKey,
          Body: body,
          ContentType: "application/json",
        }),
      );
      console.log("async_consumer_ok", { messageId, bucket: BUCKET, objectKey });
    } catch (err) {
      console.error("async_consumer_s3_put_failed", {
        messageId,
        bucket: BUCKET,
        objectKey,
        error: err.message,
      });
      throw err;
    }

    // Paso 2 — side effect según event type. Hoy solo `ticket.expired`
    // dispara email al solicitante. Si en el futuro suma más eventos
    // (ej. ticket.assigned, ticket.created), se agrega aquí.
    if (payload && payload.event === "ticket.expired") {
      await sendTicketExpiredEmail(payload, messageId);
    }
  }
};

async function sendTicketExpiredEmail(payload, messageId) {
  if (!SES_FROM_ADDRESS) {
    console.warn("async_consumer_email_skipped_no_from_address", { messageId });
    return;
  }
  const toAddress =
    payload && payload.solicitante && payload.solicitante.correo;
  if (!toAddress) {
    console.warn("async_consumer_email_skipped_no_recipient", { messageId });
    return;
  }

  const ticketId = payload.ticket_id || "(sin id)";
  const titulo = payload.titulo || "tu ticket";
  const responsable = payload.responsable || "Sin asignar";
  const slaEtiqueta = payload.sla_etiqueta || "su SLA";
  const subject = `[Ticke-T] Tu ticket "${titulo}" venció el SLA`;
  const textBody = [
    `Hola ${payload.solicitante.nombre || ""},`,
    "",
    `Tu ticket "${titulo}" (ID ${ticketId}) excedió el SLA de atención (${slaEtiqueta}) sin respuesta.`,
    `Responsable asignado: ${responsable}.`,
    `Fecha límite original: ${payload.fecha_limite || "(no disponible)"}.`,
    `Marcado como Vencido a las ${payload.expired_at}.`,
    "",
    "Estamos avisando al agente y al gerente del área. Si necesitás escalarlo,",
    "respondé este email o entrá al portal para añadir contexto al ticket.",
    "",
    "— Ticke-T",
  ].join("\n");

  try {
    const res = await ses.send(
      new SendEmailCommand({
        Source: SES_FROM_ADDRESS,
        Destination: { ToAddresses: [toAddress] },
        Message: {
          Subject: { Data: subject, Charset: "UTF-8" },
          Body: { Text: { Data: textBody, Charset: "UTF-8" } },
        },
      }),
    );
    console.log("async_consumer_email_sent", {
      messageId,
      ticket_id: ticketId,
      to: toAddress,
      ses_message_id: res.MessageId,
    });
  } catch (err) {
    console.error("async_consumer_email_failed", {
      messageId,
      ticket_id: ticketId,
      to: toAddress,
      name: err.name,
      message: err.message,
    });
    // Re-throw para que SQS reentregue y eventualmente vaya a la DLQ —
    // un fallo de SES (sandbox, recipient no verificado) es retriable
    // hasta cierto punto, y si persiste queremos visibilidad en DLQ.
    throw err;
  }
}
