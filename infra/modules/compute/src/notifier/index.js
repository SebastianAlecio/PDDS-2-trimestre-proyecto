// Lambda notifier — consumer de SQS que manda emails vía SES.
//
// Trigger: aws_lambda_event_source_mapping desde la cola ticket-notifications.
// Cada mensaje viene envuelto en la estructura SNS notification (el subscription
// SNS→SQS por default no usa raw_message_delivery), así que el body de la SQS
// record es un JSON que contiene un campo `Message` con el payload original
// publicado al topic.
//
// Comportamiento ante errores: si SES rechaza el SendEmail (recipient no
// verificado en sandbox, throttle, address inválido, etc.), el handler tira
// el error. El servicio Lambda reporta failure a SQS, que incrementa el
// receiveCount y vuelve a entregar el mensaje. Después de max_receive_count
// (3 por default) intentos, SQS mueve el mensaje a la DLQ vía la
// redrive_policy configurada en Terraform.
//
// Idempotencia: si SES acepta y después el handler tira por otra razón antes
// de retornar exitosamente, el mensaje se reintentaría y se mandaría el email
// dos veces. Para esta entrega es aceptable — SES dedupe nada y la peor
// consecuencia es un email duplicado al colaborador. Mitigación futura:
// registrar messageId procesados en DDB con TTL corto.

const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

const ses = new SESClient({});

const SES_FROM_ADDRESS = process.env.SES_FROM_ADDRESS;

exports.handler = async (event) => {
  if (!SES_FROM_ADDRESS) {
    throw new Error("SES_FROM_ADDRESS env var no está seteada");
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

    try {
      const result = await ses.send(
        new SendEmailCommand({
          Source: SES_FROM_ADDRESS,
          Destination: { ToAddresses: [to] },
          Message: {
            Subject: { Data: subject, Charset: "UTF-8" },
            Body: { Text: { Data: text, Charset: "UTF-8" } },
          },
        }),
      );
      console.log("email_sent", { messageId: result.MessageId, to, ticket_id: payload.ticket_id });
    } catch (err) {
      console.error("ses_send_failed", {
        to,
        ticket_id: payload.ticket_id,
        err: { name: err.name, message: err.message },
      });
      throw err;
    }
  }

  return { batchItemFailures: [] };
};
