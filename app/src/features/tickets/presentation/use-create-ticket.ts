import { useMemo } from "react";
import { v4 as uuid } from "uuid";
import { buildTicketFromInput } from "../domain/build-ticket-from-input";
import type {
  AttachmentMetadata,
  Ticket,
  TicketArea,
  TicketCategory,
  TicketPriority,
} from "../domain/ticket";
import type { TicketRepository } from "../domain/ticket-repository";
import { LocalStorageTicketRepository } from "../infrastructure/local-storage-ticket-repository";
import type { CreateTicketFormValues } from "./schema";

const defaultRepo = new LocalStorageTicketRepository();

export function useCreateTicket(repo: TicketRepository = defaultRepo) {
  return useMemo(
    () => ({
      async create(values: CreateTicketFormValues, files: File[]): Promise<Ticket> {
        const attachments: AttachmentMetadata[] = files.map((f) => ({
          id: uuid(),
          name: f.name,
          size: f.size,
          type: f.type || "application/octet-stream",
        }));
        const ticket = buildTicketFromInput(
          {
            title: values.title,
            category: values.category as TicketCategory,
            area: values.area as TicketArea,
            priority: values.priority as TicketPriority,
            description: values.description,
            requester: values.requester,
            attachments,
          },
          new Date(),
        );
        await repo.save(ticket);
        return ticket;
      },
    }),
    [repo],
  );
}

export function shortId(uuidStr: string): string {
  return `TKT-${uuidStr.slice(0, 6).toUpperCase()}`;
}
