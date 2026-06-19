import type { AttachmentInput, ChatMessage } from "./message";

// Resultado de pedir un presigned URL para subir un adjunto. La key
// devuelta es la que el frontend usa luego en sendMessage para referenciar
// el archivo desde S3.
export type AttachmentUploadTicket = {
  uploadUrl: string;
  key: string;
  filename: string;
  contentType: string;
  size: number;
  expiresIn: number;
};

// Payloads que el cliente WS recibe del servidor (después de parseo JSON).
// El layer infrastructure los expone como discriminated union — la
// presentation hace switch por `type`.
export type ChatServerEvent =
  | { type: "message"; ticketId: string; message: ChatMessage }
  | {
      type: "ticket_closed";
      ticketId: string;
      closedBy: { sub: string; nombre: string };
      closedAt: string;
    }
  | {
      type: "ticket_escalated";
      ticketId: string;
      escaladoPor: { sub: string; nombre: string };
      escaladoAt: string;
      razon: string;
    };

// Estado de la conexión WS, expuesto al hook que lo consume.
export type ChatConnectionState =
  | "idle"
  | "connecting"
  | "open"
  | "reconnecting"
  | "closed";

// Suscripción activa al WS. Llamar `close()` cancela reconnects y cierra
// la conexión.
export type ChatSubscription = {
  // Envía un sendMessage por WS. El messageId es client-generated para
  // permitir deduplicación idempotente en el backend (retries del cliente
  // mandan el mismo id; el backend devuelve el mismo item).
  send: (input: {
    messageId: string;
    body: string;
    attachments: AttachmentInput[];
  }) => void;
  close: () => void;
};

export type ChatSubscriptionHandlers = {
  onEvent: (event: ChatServerEvent) => void;
  onStateChange: (state: ChatConnectionState) => void;
};

// Puerto del dominio chat. La implementación HTTP+WS vive en infrastructure/.
export interface ChatRepository {
  // Historial via REST. El backend incluye download_url presigned por
  // cada attachment. Lo llamamos al abrir el panel/widget.
  listMessages(ticketId: string): Promise<ChatMessage[]>;

  // Pide presigned PUT URL para subir un adjunto. El frontend después
  // hace fetch(uploadUrl, { method:"PUT", body:file }) y manda el key
  // resultante en sendMessage.
  requestAttachmentUpload(input: {
    ticketId: string;
    filename: string;
    contentType: string;
    size: number;
  }): Promise<AttachmentUploadTicket>;

  // Sube el archivo al S3 usando la presigned URL. Devuelve void; si falla
  // tira para que el caller lo muestre como error en la UI.
  uploadAttachment(uploadUrl: string, file: File): Promise<void>;

  // Abre el WebSocket y devuelve la suscripción. handlers.onEvent recibe
  // cada broadcast; handlers.onStateChange refleja transiciones del WS
  // (connecting → open → reconnecting → closed).
  subscribe(
    input: { ticketId: string; token: string },
    handlers: ChatSubscriptionHandlers,
  ): ChatSubscription;
}
