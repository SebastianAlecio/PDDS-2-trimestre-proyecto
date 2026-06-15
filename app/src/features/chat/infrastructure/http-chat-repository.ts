import { apiFetch } from "../../../shared/api/http-client";
import type {
  AttachmentUploadTicket,
  ChatRepository,
  ChatSubscription,
  ChatSubscriptionHandlers,
} from "../domain/chat-repository";
import type { ChatMessage } from "../domain/message";
import { openChatSocket } from "./ws-client";

// Wire types — exactly como los devuelve el backend (snake_case).
type MessageResponseItem = {
  message_id: string;
  author_id: string;
  author_name: string;
  author_role: string;
  body: string;
  attachments: Array<{
    key: string;
    content_type: string;
    filename: string;
    size: number | null;
    download_url: string;
  }>;
  created_at: string;
};

type ListMessagesResponse = {
  ticket_id: string;
  messages: MessageResponseItem[];
};

type AttachmentUrlResponse = {
  upload_url: string;
  key: string;
  filename: string;
  content_type: string;
  size: number;
  expires_in: number;
};

function mapMessage(raw: MessageResponseItem): ChatMessage {
  return {
    messageId: raw.message_id,
    authorId: raw.author_id,
    authorName: raw.author_name,
    authorRole: raw.author_role === "agente" ? "agente" : "colaborador",
    body: raw.body,
    attachments: (raw.attachments ?? []).map((a) => ({
      key: a.key,
      contentType: a.content_type,
      filename: a.filename,
      size: a.size,
      downloadUrl: a.download_url ?? "",
    })),
    createdAt: raw.created_at,
  };
}

export class HttpChatRepository implements ChatRepository {
  async listMessages(ticketId: string): Promise<ChatMessage[]> {
    const response = await apiFetch<ListMessagesResponse>(
      `/tickets/${encodeURIComponent(ticketId)}/messages`,
      { method: "GET" },
    );
    return (response.messages ?? []).map(mapMessage);
  }

  async requestAttachmentUpload(input: {
    ticketId: string;
    filename: string;
    contentType: string;
    size: number;
  }): Promise<AttachmentUploadTicket> {
    const response = await apiFetch<AttachmentUrlResponse>(
      `/tickets/${encodeURIComponent(input.ticketId)}/messages/attachments`,
      {
        method: "POST",
        body: {
          filename: input.filename,
          content_type: input.contentType,
          size: input.size,
        },
      },
    );
    return {
      uploadUrl: response.upload_url,
      key: response.key,
      filename: response.filename,
      contentType: response.content_type,
      size: response.size,
      expiresIn: response.expires_in,
    };
  }

  // Sube directo a S3 con la presigned URL. El Content-Type DEBE matchear
  // el que se pidió en requestAttachmentUpload — el backend lo firmó al
  // generar la URL y S3 rechaza con 403 si difiere.
  async uploadAttachment(uploadUrl: string, file: File): Promise<void> {
    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `S3 upload failed (${response.status}): ${detail || response.statusText}`,
      );
    }
  }

  subscribe(
    input: { ticketId: string; token: string },
    handlers: ChatSubscriptionHandlers,
  ): ChatSubscription {
    return openChatSocket(input, handlers);
  }
}
