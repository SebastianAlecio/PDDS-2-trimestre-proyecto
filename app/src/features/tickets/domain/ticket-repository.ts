import type { Ticket } from "./ticket";

export interface TicketRepository {
  save(ticket: Ticket): Promise<void>;
  list(): Promise<Ticket[]>;
}
