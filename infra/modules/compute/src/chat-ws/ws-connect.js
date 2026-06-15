// $connect handler. API Gateway invoca esta función cuando el cliente abre
// la conexión WebSocket. Si devolvemos un statusCode != 2xx, API Gateway
// rechaza el handshake — eso es exactamente la puerta de auth.
//
// Query string esperado: ?token=<cognito-id-token>&ticket_id=<uuid>
// Token y ticket_id se mandan por query porque los WebSockets nativos del
// browser no permiten setear headers en el handshake.

const { verifyIdToken } = require("./jwt-verify");
const chatRepo = require("./chat-repo");

const AGENT_GROUPS = new Set(["agente-n1", "agente-n2"]);

function resolveRole(groups) {
  if (!Array.isArray(groups)) return "colaborador";
  return groups.some((g) => AGENT_GROUPS.has(g)) ? "agente" : "colaborador";
}

function deny(statusCode, message) {
  console.log("ws_connect_denied", JSON.stringify({ statusCode, message }));
  return { statusCode, body: message };
}

exports.handler = async (event) => {
  const qs = event.queryStringParameters || {};
  const token = qs.token;
  const ticketId = qs.ticket_id;
  const connectionId = event.requestContext.connectionId;

  if (!token || !ticketId) {
    return deny(400, "missing token or ticket_id");
  }

  let claims;
  try {
    claims = await verifyIdToken(token);
  } catch (err) {
    console.log("ws_connect_jwt_failed", err.message);
    return deny(401, "invalid token");
  }

  const ticket = await chatRepo.getTicket(ticketId);
  if (!ticket) {
    return deny(404, "ticket not found");
  }

  // Authorize: solicitante o agente asignado únicos autorizados.
  const sub = claims.sub;
  if (!chatRepo.isPartyToTicket(ticket, sub)) {
    return deny(403, "not a party to this ticket");
  }

  const user = {
    sub,
    name: claims.name || claims.email || sub,
    role: resolveRole(claims["cognito:groups"]),
  };

  try {
    await chatRepo.registerConnection({ ticketId, connectionId, user });
  } catch (err) {
    console.error("ws_connect_register_failed", err);
    return deny(500, "failed to register connection");
  }

  console.log(
    "ws_connect_ok",
    JSON.stringify({ ticketId, connectionId, sub, role: user.role }),
  );
  return { statusCode: 200, body: "OK" };
};
