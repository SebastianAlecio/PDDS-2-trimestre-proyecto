import type { Ticket } from "../domain/ticket";
import type { TicketRepository } from "../domain/ticket-repository";

const STORAGE_KEY = "ticke-t:tickets";

export class LocalStorageTicketRepository implements TicketRepository {
  async save(ticket: Ticket): Promise<void> {
    const existing = await this.list();
    const next = [...existing, ticket];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  async list(): Promise<Ticket[]> {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed as Ticket[];
    } catch {
      return [];
    }
  }
}
