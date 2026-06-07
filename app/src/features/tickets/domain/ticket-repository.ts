import type { CreateTicketInput, Ticket } from "./ticket";

export type QueueData = {
  unassigned: Ticket[];
  mine: Ticket[];
};

// `files` debe matchear posicionalmente con `input.attachments`: el archivo
// en `files[i]` se sube al `s3_key` que el backend asigna al `attachments[i]`.
// Si no hay adjuntos, ambos arrays van vacíos.
export interface TicketRepository {
  create(input: CreateTicketInput, files?: File[]): Promise<Ticket>;
  listMyTickets(limit?: number): Promise<Ticket[]>;
  listQueue(): Promise<QueueData>;
  assignToMe(ticketId: string): Promise<Ticket>;
  closeTicket(ticketId: string): Promise<Ticket>;
}
