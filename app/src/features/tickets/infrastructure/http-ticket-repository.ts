import { apiFetch } from "../../../shared/api/http-client";
import type { CreateTicketInput, Ticket } from "../domain/ticket";
import type { QueueData, TicketRepository } from "../domain/ticket-repository";
import { mapDynamoItemToTicket } from "./dynamodb-item-mapper";

// Implementación HTTP del repository. Llama a la HTTP API expuesta por
// API Gateway. La autenticación (Authorization Bearer <id-token>) la
// agrega apiFetch automáticamente.

type PresignedUpload = {
  s3_key: string;
  url: string;
  expires_in: number;
};

type CreateResponse = {
  id: string;
  item: unknown;
  object_key: string | null;
  uploads: PresignedUpload[];
};
type ListResponse = { items: unknown[]; count: number };
type QueueResponse = { unassigned: unknown[]; mine: unknown[] };
type AssignResponse = { id: string; item: unknown };
type CloseResponse = { id: string; item: unknown };

export class HttpTicketRepository implements TicketRepository {
  async create(input: CreateTicketInput, files: File[] = []): Promise<Ticket> {
    const response = await apiFetch<CreateResponse>("/tickets", {
      method: "POST",
      body: {
        title: input.title,
        description: input.description,
        category: input.category,
        area: input.area,
        priority: input.priority,
        requester: { area: input.requesterArea },
        attachments: input.attachments,
      },
    });

    // El backend devolvió un presigned PUT URL por cada adjunto. Subimos
    // cada archivo directamente a S3 (sin pasar por Lambda — evita el
    // límite de 6 MB del payload de API Gateway). El orden de `uploads`
    // matchea el orden de `input.attachments`, que a su vez matchea el
    // orden de `files`.
    if (response.uploads && response.uploads.length > 0 && files.length === response.uploads.length) {
      await Promise.all(
        response.uploads.map((upload, idx) => uploadFileToS3(upload.url, files[idx]!)),
      );
    }

    return mapDynamoItemToTicket(response.item);
  }

  async listMyTickets(limit?: number): Promise<Ticket[]> {
    const response = await apiFetch<ListResponse>("/tickets/me", {
      method: "GET",
      query: limit !== undefined ? { limit } : undefined,
    });
    return (response.items ?? []).map(mapDynamoItemToTicket);
  }

  async listQueue(): Promise<QueueData> {
    const response = await apiFetch<QueueResponse>("/tickets/queue", {
      method: "GET",
    });
    return {
      unassigned: (response.unassigned ?? []).map(mapDynamoItemToTicket),
      mine: (response.mine ?? []).map(mapDynamoItemToTicket),
    };
  }

  async assignToMe(ticketId: string): Promise<Ticket> {
    const response = await apiFetch<AssignResponse>(
      `/tickets/${encodeURIComponent(ticketId)}/assign`,
      { method: "PUT" },
    );
    return mapDynamoItemToTicket(response.item);
  }

  async closeTicket(ticketId: string): Promise<Ticket> {
    const response = await apiFetch<CloseResponse>(
      `/tickets/${encodeURIComponent(ticketId)}/status`,
      { method: "PUT", body: { status: "Cerrado" } },
    );
    return mapDynamoItemToTicket(response.item);
  }
}

// Sube un único archivo a S3 vía presigned PUT URL. El Content-Type DEBE
// coincidir con el que se usó al generar el URL (el backend lo bindea al
// `attachment.type` original); si difiere, S3 rechaza con 403 SignatureDoesNotMatch.
// No usa apiFetch porque el destino es S3 directo, no nuestra API.
async function uploadFileToS3(url: string, file: File): Promise<void> {
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`S3 upload failed (${response.status}): ${detail || response.statusText}`);
  }
}
