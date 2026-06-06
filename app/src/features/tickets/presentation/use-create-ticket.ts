import { useMemo } from "react";
import { v4 as uuid } from "uuid";
import type {
  AttachmentMetadata,
  Ticket,
  TicketArea,
  TicketCategory,
  TicketPriority,
} from "../domain/ticket";
import type { TicketRepository } from "../domain/ticket-repository";
import { HttpTicketRepository } from "../infrastructure/http-ticket-repository";
import type { CreateTicketFormValues } from "./schema";

const defaultRepo = new HttpTicketRepository();

export function useCreateTicket(repo: TicketRepository = defaultRepo) {
  return useMemo(
    () => ({
      async create(
        values: CreateTicketFormValues,
        files: File[],
      ): Promise<Ticket> {
        const attachments: AttachmentMetadata[] = files.map((f) => ({
          id: uuid(),
          name: f.name,
          size: f.size,
          type: f.type || "application/octet-stream",
        }));
        return repo.create(
          {
            title: values.title,
            category: values.category as TicketCategory,
            area: values.area as TicketArea,
            priority: values.priority as TicketPriority,
            description: values.description,
            requesterArea: values.requesterArea,
            attachments,
          },
          files, // los binarios se suben a S3 vía presigned URLs después del POST
        );
      },
    }),
    [repo],
  );
}

export function shortId(uuidStr: string): string {
  return `TKT-${uuidStr.slice(0, 6).toUpperCase()}`;
}
