export type TicketCategory = "incidente" | "solicitud" | "mejora";

export type TicketArea = "RRHH" | "IT" | "Legal" | "Finanzas";

export type TicketPriority = "alta" | "media" | "baja";

export type TicketStatus =
  | "Abierto"
  | "En progreso"
  | "Esperando colaborador"
  | "Resuelto"
  | "Cerrado"
  | "Vencido";

export type AttachmentMetadata = {
  id: string;
  name: string;
  size: number;
  type: string;
};

export type Requester = {
  name: string;
  email: string;
  area: string;
  userId: string;
};

export type Ticket = {
  id: string;
  title: string;
  category: TicketCategory;
  area: TicketArea;
  priority: TicketPriority;
  description: string;
  status: TicketStatus;
  responsible: string;
  createdAt: string;
  dueAt: string;
  slaLabel: string;
  requester: Requester;
  attachments: AttachmentMetadata[];
};

// Input que el frontend envía al backend al crear un ticket. La identidad
// del solicitante (nombre, correo, user_id) la pone el backend desde el
// JWT — solo viaja el área porque Cognito no la conoce.
export type CreateTicketInput = {
  title: string;
  category: TicketCategory;
  area: TicketArea;
  priority: TicketPriority;
  description: string;
  requesterArea: string;
  attachments: AttachmentMetadata[];
};

export const TICKET_CATEGORIES: TicketCategory[] = [
  "incidente",
  "solicitud",
  "mejora",
];

export const TICKET_AREAS: TicketArea[] = ["RRHH", "IT", "Legal", "Finanzas"];

export const TICKET_PRIORITIES: TicketPriority[] = ["alta", "media", "baja"];
