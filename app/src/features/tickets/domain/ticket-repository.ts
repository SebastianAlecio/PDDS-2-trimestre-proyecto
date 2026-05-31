import type { CreateTicketInput, Ticket } from "./ticket";

export type QueueData = {
  unassigned: Ticket[];
  mine: Ticket[];
};

export interface TicketRepository {
  create(input: CreateTicketInput): Promise<Ticket>;
  listMyTickets(limit?: number): Promise<Ticket[]>;
  listQueue(): Promise<QueueData>;
  assignToMe(ticketId: string): Promise<Ticket>;
}
