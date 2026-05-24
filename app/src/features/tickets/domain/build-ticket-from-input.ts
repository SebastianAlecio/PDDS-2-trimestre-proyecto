import { v4 as uuid } from "uuid";
import { deriveSla } from "./sla";
import type { CreateTicketInput, Ticket } from "./ticket";

export function buildTicketFromInput(
  input: CreateTicketInput,
  now: Date = new Date(),
): Ticket {
  const { label, dueAt } = deriveSla(input.priority, now);
  return {
    id: uuid(),
    title: input.title.trim(),
    category: input.category,
    area: input.area,
    priority: input.priority,
    description: input.description.trim(),
    status: "Abierto",
    responsible: "Sin asignar",
    createdAt: now.toISOString(),
    dueAt: dueAt.toISOString(),
    slaLabel: label,
    requester: {
      name: input.requester.name.trim(),
      email: input.requester.email.trim().toLowerCase(),
      area: input.requester.area.trim(),
      userId: input.requester.userId.trim(),
    },
    attachments: input.attachments,
  };
}
