import { apiFetch } from "../../../shared/api/http-client";
import type { CreateTicketInput, Ticket } from "../domain/ticket";
import type { QueueData, TicketRepository } from "../domain/ticket-repository";
import { mapDynamoItemToTicket } from "./dynamodb-item-mapper";

// Implementación HTTP del repository. Llama a la HTTP API expuesta por
// API Gateway. La autenticación (Authorization Bearer <id-token>) la
// agrega apiFetch automáticamente.

type CreateResponse = { id: string; item: unknown };
type ListResponse = { items: unknown[]; count: number };
type QueueResponse = { unassigned: unknown[]; mine: unknown[] };
type AssignResponse = { id: string; item: unknown };

export class HttpTicketRepository implements TicketRepository {
  async create(input: CreateTicketInput): Promise<Ticket> {
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
}
