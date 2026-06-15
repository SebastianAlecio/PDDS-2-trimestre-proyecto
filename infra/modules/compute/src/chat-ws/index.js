// Router top-level del chat-ws Lambda.
//
// La función recibe dos tipos de eventos:
//   - WebSocket: event.requestContext.eventType ∈ {CONNECT, DISCONNECT, MESSAGE}
//   - HTTP (REST API integration): event.httpMethod + event.resource
//
// Despachamos por tipo y dentro de WS por routeKey ($connect, $disconnect,
// sendMessage). Para HTTP, por `${method} ${resource}` igual que la tickets
// Lambda.

const wsConnect = require("./ws-connect");
const wsDisconnect = require("./ws-disconnect");
const wsSendMessage = require("./ws-send-message");
const httpListMessages = require("./http-list-messages");
const httpAttachmentUrl = require("./http-attachment-url");
const { jsonResponse } = require("./response");

exports.handler = async (event) => {
  const ctx = event.requestContext || {};
  const eventType = ctx.eventType;

  console.log("chat-ws_received", JSON.stringify({
    eventType,
    routeKey: ctx.routeKey,
    httpMethod: event.httpMethod,
    resource: event.resource,
    connectionId: ctx.connectionId,
    requestId: ctx.requestId,
  }));

  // WebSocket events
  if (eventType === "CONNECT") return wsConnect.handler(event);
  if (eventType === "DISCONNECT") return wsDisconnect.handler(event);
  if (eventType === "MESSAGE") {
    // El routeKey del MESSAGE es el valor del campo `action` del body.
    const routeKey = ctx.routeKey;
    if (routeKey === "sendMessage") return wsSendMessage.handler(event);
    return { statusCode: 400, body: `Unknown WS routeKey: ${routeKey}` };
  }

  // HTTP events (REST API integration)
  if (event.httpMethod && event.resource) {
    const key = `${event.httpMethod} ${event.resource}`;
    if (key === "GET /tickets/{id}/messages") return httpListMessages.handler(event);
    if (key === "POST /tickets/{id}/messages/attachments") return httpAttachmentUrl.handler(event);
    return jsonResponse(404, { error: `route ${key} is not handled` });
  }

  return jsonResponse(400, { error: "unknown event shape" });
};

