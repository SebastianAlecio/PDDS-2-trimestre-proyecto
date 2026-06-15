// $disconnect handler. API Gateway dispara cuando el cliente cierra el WS
// (o cuando el idle timeout de 10 min se cumple sin tráfico).
//
// El evento solo trae connectionId — para borrar el item bajo
// TICKET#<id>/CONN#<connId> primero hay que resolver qué ticket era.
// Idempotente: si los items ya no están (TTL, race con otra invocación)
// no falla.

const chatRepo = require("./chat-repo");

exports.handler = async (event) => {
  const connectionId = event.requestContext.connectionId;

  let meta;
  try {
    meta = await chatRepo.getConnectionMeta(connectionId);
  } catch (err) {
    console.error("ws_disconnect_meta_lookup_failed", err);
    // Aun así devolvemos 200: $disconnect no puede recuperarse.
    return { statusCode: 200, body: "OK" };
  }

  if (!meta) {
    console.log(
      "ws_disconnect_meta_missing",
      JSON.stringify({ connectionId }),
    );
    return { statusCode: 200, body: "OK" };
  }

  try {
    await chatRepo.removeConnection({
      ticketId: meta.ticket_id,
      connectionId,
    });
  } catch (err) {
    console.error("ws_disconnect_remove_failed", err);
  }

  console.log(
    "ws_disconnect_ok",
    JSON.stringify({ connectionId, ticketId: meta.ticket_id }),
  );
  return { statusCode: 200, body: "OK" };
};
