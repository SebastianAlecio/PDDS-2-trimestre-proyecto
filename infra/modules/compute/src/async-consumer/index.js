"use strict";

// Async consumer Lambda — disparada por aws_lambda_event_source_mapping
// desde la cola del módulo async/. Por cada record SQS:
//   1. Parsea el body JSON.
//   2. Escribe UN objeto a S3 (prefijo async-events/<message_id>.json) con
//      el payload completo + metadata de procesamiento.
//   3. Loggea el messageId — requisito del rubric OYD-D4 Deliverable E:
//      "the consumer must log the processed message ID".
//
// Si tirar un error desde el handler, SQS reentrega el record hasta
// max_receive_count veces (configurado en el módulo async/); después
// SQS lo mueve a la DLQ vía redrive_policy. Esa cadena es la que hace
// que un bug del consumer no descarte mensajes silenciosamente.

const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const BUCKET = process.env.ASYNC_BUCKET_NAME;
const KEY_PREFIX = process.env.ASYNC_BUCKET_KEY_PREFIX || "async-events/";

if (!BUCKET) {
  // Lanzamos en init — Lambda reusa containers warm, así que el error
  // aparece en CloudWatch al primer trigger y el deploy queda evidente
  // como roto en vez de fallar silenciosamente record por record.
  throw new Error("ASYNC_BUCKET_NAME es requerido");
}

const s3 = new S3Client({});

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
      // Re-throw para que SQS reentregue y eventualmente vaya a la DLQ —
      // el productor mandó un body inválido, no es algo que el consumer
      // pueda arreglar en sucesivos retries pero igual queremos visibilidad.
      throw err;
    }

    const objectKey = `${KEY_PREFIX}${messageId}.json`;
    const processedAt = new Date().toISOString();
    const body = JSON.stringify(
      {
        message_id: messageId,
        processed_at: processedAt,
        payload,
      },
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
      console.log("async_consumer_ok", {
        messageId,
        bucket: BUCKET,
        objectKey,
      });
    } catch (err) {
      console.error("async_consumer_s3_put_failed", {
        messageId,
        bucket: BUCKET,
        objectKey,
        error: err.message,
      });
      throw err;
    }
  }
};
