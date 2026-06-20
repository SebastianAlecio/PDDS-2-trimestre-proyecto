import type {
  ChatServerEvent,
  ChatSubscription,
  ChatSubscriptionHandlers,
} from "../domain/chat-repository";
import type { AttachmentInput } from "../domain/message";

// Endpoint del WS API Gateway. Setearlo via .env.local: VITE_WS_ENDPOINT=wss://ws.ticke-t.lumenchat.app
// (sin slash final). En prod apunta al custom domain del módulo realtime.
const WS_ENDPOINT = import.meta.env.VITE_WS_ENDPOINT as string | undefined;

// Política de reconnect exponencial con tope. Si el WS se cae (network,
// idle timeout de API GW de 10 min sin tráfico), reintenta con backoff
// 1s → 2s → 4s → 8s → 16s → 30s y se queda ahí. Si llegamos al límite
// max attempts sin éxito, transicionamos a "closed" y dejamos de reintentar.
const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 16000, 30000];
const MAX_RECONNECT_ATTEMPTS = 8;

type Outbox = Array<string>;

export function openChatSocket(
  input: { ticketId: string; token: string },
  handlers: ChatSubscriptionHandlers,
): ChatSubscription {
  if (!WS_ENDPOINT) {
    throw new Error("VITE_WS_ENDPOINT no está configurado");
  }

  // Estado del controller persistente — sobrevive a reconnects.
  let closedByCaller = false;
  let socket: WebSocket | null = null;
  let reconnectAttempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  // Mensajes que se intentaron enviar mientras el socket estaba conectando
  // o reconectando; se drenan al onopen.
  const outbox: Outbox = [];

  const url = `${WS_ENDPOINT}?token=${encodeURIComponent(input.token)}&ticket_id=${encodeURIComponent(input.ticketId)}`;

  function setState(state: Parameters<typeof handlers.onStateChange>[0]) {
    handlers.onStateChange(state);
  }

  function connect() {
    if (closedByCaller) return;
    setState(reconnectAttempts === 0 ? "connecting" : "reconnecting");

    const ws = new WebSocket(url);
    socket = ws;

    ws.onopen = () => {
      reconnectAttempts = 0;
      setState("open");
      // Drain outbox
      while (outbox.length > 0 && ws.readyState === WebSocket.OPEN) {
        const next = outbox.shift();
        if (next !== undefined) ws.send(next);
      }
    };

    ws.onmessage = (ev) => {
      const payload = parseEvent(ev.data);
      if (payload) handlers.onEvent(payload);
    };

    ws.onerror = (ev) => {
      // No transicionamos estado acá — onclose viene después y maneja
      // el reconnect. ev de error normalmente no trae detalles útiles.
      console.warn("ws_chat_error", ev);
    };

    ws.onclose = (ev) => {
      socket = null;
      if (closedByCaller) {
        setState("closed");
        return;
      }
      // 1000/1001 son cierres limpios — no reintentar si el server dice
      // que terminamos (ej. nos sacaron del ticket, 4xxx del policy).
      // 1006 (abnormal close) + 1011 (server error) ameritan reconnect.
      const shouldReconnect =
        ev.code !== 1000 &&
        ev.code !== 1001 &&
        reconnectAttempts < MAX_RECONNECT_ATTEMPTS;

      if (!shouldReconnect) {
        setState("closed");
        return;
      }

      const delay =
        RECONNECT_DELAYS_MS[Math.min(reconnectAttempts, RECONNECT_DELAYS_MS.length - 1)] ?? 30000;
      reconnectAttempts += 1;
      setState("reconnecting");
      reconnectTimer = setTimeout(connect, delay);
    };
  }

  function send(input: {
    messageId: string;
    body: string;
    attachments: AttachmentInput[];
  }) {
    const payload = JSON.stringify({
      action: "sendMessage",
      message_id: input.messageId,
      body: input.body,
      attachments: input.attachments.map((a) => ({
        key: a.key,
        content_type: a.contentType,
        filename: a.filename,
        size: a.size,
      })),
    });
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(payload);
    } else {
      // Encolamos hasta que el onopen drene. Si seguimos en "closed"
      // y nunca abrimos, este mensaje se pierde — está OK como MVP;
      // la UI puede mostrar el estado "closed" y bloquear el textarea.
      outbox.push(payload);
    }
  }

  function close() {
    closedByCaller = true;
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (socket && socket.readyState <= WebSocket.OPEN) {
      socket.close(1000, "client closed");
    }
    setState("closed");
  }

  connect();

  return { send, close };
}

// Parser defensivo: el server siempre debería mandar JSON válido con
// `type` discriminator, pero validamos antes de propagar al handler.
function parseEvent(raw: unknown): ChatServerEvent | null {
  if (typeof raw !== "string") return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!json || typeof json !== "object") return null;
  const obj = json as Record<string, unknown>;
  const type = obj.type;

  if (type === "message") {
    const ticketId = typeof obj.ticket_id === "string" ? obj.ticket_id : null;
    const msg = obj.message;
    if (!ticketId || !msg || typeof msg !== "object") return null;
    const m = msg as Record<string, unknown>;
    return {
      type: "message",
      ticketId,
      message: {
        messageId: String(m.message_id ?? ""),
        authorId: String(m.author_id ?? ""),
        authorName: String(m.author_name ?? ""),
        authorRole: m.author_role === "agente" ? "agente" : "colaborador",
        body: String(m.body ?? ""),
        attachments: Array.isArray(m.attachments)
          ? m.attachments.map((a) => {
              const at = a as Record<string, unknown>;
              return {
                key: String(at.key ?? ""),
                contentType: String(at.content_type ?? "application/octet-stream"),
                filename: String(at.filename ?? ""),
                size: typeof at.size === "number" ? at.size : null,
                downloadUrl: typeof at.download_url === "string" ? at.download_url : "",
              };
            })
          : [],
        createdAt: String(m.created_at ?? ""),
      },
    };
  }

  if (type === "ticket_closed") {
    const ticketId = typeof obj.ticket_id === "string" ? obj.ticket_id : null;
    const closedBy = obj.closed_by as Record<string, unknown> | undefined;
    const closedAt = typeof obj.closed_at === "string" ? obj.closed_at : "";
    if (!ticketId) return null;
    return {
      type: "ticket_closed",
      ticketId,
      closedBy: {
        sub: String(closedBy?.sub ?? ""),
        nombre: String(closedBy?.nombre ?? ""),
      },
      closedAt,
    };
  }

  if (type === "ticket_escalated") {
    const ticketId = typeof obj.ticket_id === "string" ? obj.ticket_id : null;
    const escaladoPor = obj.escalado_por as Record<string, unknown> | undefined;
    const escaladoAt = typeof obj.escalado_at === "string" ? obj.escalado_at : "";
    const razon = typeof obj.razon === "string" ? obj.razon : "";
    if (!ticketId) return null;
    return {
      type: "ticket_escalated",
      ticketId,
      escaladoPor: {
        sub: String(escaladoPor?.sub ?? ""),
        nombre: String(escaladoPor?.nombre ?? ""),
      },
      escaladoAt,
      razon,
    };
  }

  return null;
}
