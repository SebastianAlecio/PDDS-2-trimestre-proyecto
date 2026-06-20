import { fetchAuthSession } from "aws-amplify/auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HttpError } from "../../../shared/api/http-client";
import type {
  ChatConnectionState,
  ChatRepository,
  ChatSubscription,
} from "../domain/chat-repository";
import type { AttachmentInput, ChatMessage } from "../domain/message";
import { HttpChatRepository } from "../infrastructure/http-chat-repository";

const defaultRepo = new HttpChatRepository();

// Estado de carga del historial inicial (REST).
type HistoryState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "error"; message: string };

// Estado del envío de un mensaje (incluye upload de adjuntos previo + WS send).
export type SendState =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "error"; message: string };

export type ChatTicketClosedSignal = {
  closedAt: string;
  closedByName: string;
};

// Mensaje de sistema (no chat regular) renderizado como banner en línea
// con el feed. Por ahora solo "escalado"; se puede ampliar a otros eventos
// del ticket si suman a la conversación.
export type ChatSystemMessage = {
  id: string;
  kind: "escalated";
  createdAt: string;
  byName: string;
  reason: string;
};

export type UseChatOptions = {
  // Cuándo cerrar el ticket triggerea callback para la UI (colaborador:
  // cierra el widget; agente: vuelve a la cola).
  onTicketClosed?: (signal: ChatTicketClosedSignal) => void;
};

export function useChat(
  ticketId: string | null,
  options: UseChatOptions = {},
  repo: ChatRepository = defaultRepo,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [historyState, setHistoryState] = useState<HistoryState>({ kind: "idle" });
  const [connectionState, setConnectionState] = useState<ChatConnectionState>("idle");
  const [sendState, setSendState] = useState<SendState>({ kind: "idle" });
  const [ticketClosed, setTicketClosed] = useState<ChatTicketClosedSignal | null>(null);
  const [systemMessages, setSystemMessages] = useState<ChatSystemMessage[]>([]);

  // Suscripción activa al WS. La guardamos en ref para que el cleanup
  // del useEffect pueda llamar a close() aún si el callback del hook
  // cambió entre renders.
  const subscriptionRef = useRef<ChatSubscription | null>(null);

  // Las callbacks del subscribe son stable references; las guardamos en
  // refs para que el useEffect de bootstrap NO se re-ejecute cuando
  // options.onTicketClosed cambia entre renders del consumer.
  const onTicketClosedRef = useRef(options.onTicketClosed);
  useEffect(() => {
    onTicketClosedRef.current = options.onTicketClosed;
  }, [options.onTicketClosed]);

  // Bootstrap: cargar history + abrir WS cuando hay ticketId. Si cambia
  // el ticketId, limpiamos todo y empezamos de cero.
  useEffect(() => {
    if (!ticketId) {
      setMessages([]);
      setHistoryState({ kind: "idle" });
      setConnectionState("idle");
      setTicketClosed(null);
      setSystemMessages([]);
      return;
    }

    let cancelled = false;

    async function bootstrap() {
      setHistoryState({ kind: "loading" });
      setConnectionState("idle");
      setTicketClosed(null);
      setSystemMessages([]);

      // 1) Resolver token Cognito PRIMERO. El widget puede abrirse antes
      //    de que Amplify haya hidratado los tokens desde el storage
      //    (race entre el mount del componente y la inicialización del
      //    AuthProvider). Sin esta espera, el primer listMessages disparaba
      //    401 y mostraba "Tu sesión expiró" prematuramente. Reintentamos
      //    hasta 3 veces con backoff corto antes de dar por perdida la sesión.
      let token: string | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (cancelled) return;
        try {
          const session = await fetchAuthSession();
          const idToken = session.tokens?.idToken?.toString();
          if (idToken) {
            token = idToken;
            break;
          }
        } catch (err) {
          console.warn(`use_chat_token_attempt_${attempt}_failed`, err);
        }
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
        }
      }

      if (cancelled) return;

      if (!token) {
        setConnectionState("closed");
        setHistoryState({
          kind: "error",
          message: "No se pudo obtener tu sesión. Vuelve a iniciar sesión.",
        });
        return;
      }

      // 2) Cargar history vía REST — con el token ya validado, no debería
      //    dar 401 por timing.
      try {
        const history = await repo.listMessages(ticketId!);
        if (cancelled) return;
        setMessages(history);
        setHistoryState({ kind: "ready" });
      } catch (err) {
        if (cancelled) return;
        setHistoryState({ kind: "error", message: humanizeChatError(err) });
        return;
      }

      if (cancelled) return;

      const subscription = repo.subscribe(
        { ticketId: ticketId!, token },
        {
          onEvent: (event) => {
            if (event.type === "message") {
              setMessages((prev) => mergeMessage(prev, event.message));
              return;
            }
            if (event.type === "ticket_closed") {
              const signal: ChatTicketClosedSignal = {
                closedAt: event.closedAt,
                closedByName: event.closedBy.nombre,
              };
              setTicketClosed(signal);
              if (onTicketClosedRef.current) {
                onTicketClosedRef.current(signal);
              }
              return;
            }
            if (event.type === "ticket_escalated") {
              // Idempotente: si llega duplicado (reconnect re-broadcast),
              // dedupeamos por (createdAt + byName) ya que el server no
              // expone un id estable para system events. Es lo bastante
              // único en la práctica.
              const sysMsg: ChatSystemMessage = {
                id: `esc-${event.escaladoAt}-${event.escaladoPor.sub}`,
                kind: "escalated",
                createdAt: event.escaladoAt,
                byName: event.escaladoPor.nombre,
                reason: event.razon,
              };
              setSystemMessages((prev) =>
                prev.some((m) => m.id === sysMsg.id) ? prev : [...prev, sysMsg],
              );
            }
          },
          onStateChange: (state) => {
            setConnectionState(state);
          },
        },
      );
      subscriptionRef.current = subscription;
    }

    void bootstrap();

    return () => {
      cancelled = true;
      if (subscriptionRef.current) {
        subscriptionRef.current.close();
        subscriptionRef.current = null;
      }
    };
  }, [ticketId, repo]);

  const send = useCallback(
    async (input: { body: string; files: File[] }) => {
      if (!ticketId) {
        setSendState({ kind: "error", message: "No hay ticket activo." });
        return;
      }
      const trimmedBody = input.body.trim();
      if (!trimmedBody && input.files.length === 0) {
        setSendState({
          kind: "error",
          message: "Escribe un mensaje o adjunta un archivo.",
        });
        return;
      }
      if (!subscriptionRef.current) {
        setSendState({
          kind: "error",
          message: "El chat aún no está conectado.",
        });
        return;
      }

      setSendState({ kind: "pending" });

      try {
        // Subir adjuntos primero. Cada archivo: pedir presigned URL,
        // hacer PUT a S3, guardar el AttachmentInput resultante.
        const attachments: AttachmentInput[] = [];
        for (const file of input.files) {
          const ticket = await repo.requestAttachmentUpload({
            ticketId,
            filename: file.name,
            contentType: file.type || "application/octet-stream",
            size: file.size,
          });
          await repo.uploadAttachment(ticket.uploadUrl, file);
          attachments.push({
            key: ticket.key,
            contentType: ticket.contentType,
            filename: ticket.filename,
            size: ticket.size,
          });
        }

        const messageId = generateClientMessageId();
        subscriptionRef.current.send({
          messageId,
          body: trimmedBody,
          attachments,
        });

        setSendState({ kind: "idle" });
      } catch (err) {
        setSendState({ kind: "error", message: humanizeChatError(err) });
      }
    },
    [ticketId, repo],
  );

  const dismissSendError = useCallback(() => {
    setSendState({ kind: "idle" });
  }, []);

  return useMemo(
    () => ({
      messages,
      historyState,
      connectionState,
      sendState,
      ticketClosed,
      systemMessages,
      send,
      dismissSendError,
    }),
    [
      messages,
      historyState,
      connectionState,
      sendState,
      ticketClosed,
      systemMessages,
      send,
      dismissSendError,
    ],
  );
}

// Inserta o reemplaza un mensaje en la lista por messageId. Reemplazo
// idempotente: si el server hizo dedup por message_id y vuelve a mandar
// el item, NO duplicamos.
function mergeMessage(prev: ChatMessage[], next: ChatMessage): ChatMessage[] {
  const existingIdx = prev.findIndex((m) => m.messageId === next.messageId);
  if (existingIdx === -1) return [...prev, next];
  const copy = prev.slice();
  copy[existingIdx] = next;
  return copy;
}

function generateClientMessageId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `cli-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function humanizeChatError(err: unknown): string {
  if (err instanceof HttpError) {
    if (err.status === 401) return "Tu sesión expiró. Vuelve a iniciar sesión.";
    if (err.status === 403) return "No tienes acceso a este chat.";
    if (err.status === 404) return "El ticket ya no existe.";
    if (err.status === 413) return "El archivo excede el límite permitido.";
    if (err.status === 415) return "Tipo de archivo no permitido.";
    return `Error del servidor (${err.status}): ${err.message}`;
  }
  if (err instanceof Error) return err.message;
  return "Error inesperado en el chat.";
}
