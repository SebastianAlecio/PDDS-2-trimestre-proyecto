import type {
  AttachmentMetadata,
  Ticket,
  TicketArea,
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from "../domain/ticket";

// Shape "crudo" del item single-table como sale de DynamoDB (atributos en
// español, según el handler de la Lambda). No lo exportamos: solo se usa
// para mapear al type Ticket que ve el resto de la app.
type RawAttachment = {
  id: string;
  name: string;
  size: number;
  type: string;
  // Snake_case: backend lo envía como `download_url` (presigned GET S3 de 5 min).
  download_url?: string;
};

type RawTicketItem = {
  ticket_id: string;
  titulo: string;
  categoria: string;
  area: string;
  prioridad: string;
  descripcion: string;
  estado: string;
  responsable: string;
  created_at: string;
  fecha_limite: string;
  sla_etiqueta: string;
  solicitante: {
    nombre: string;
    correo: string;
    area: string;
    user_id: string;
  };
  adjuntos: RawAttachment[];
};

export function mapDynamoItemToTicket(raw: unknown): Ticket {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid ticket item from API: not an object");
  }
  const item = raw as Partial<RawTicketItem>;
  return {
    id: requireString(item.ticket_id, "ticket_id"),
    title: requireString(item.titulo, "titulo"),
    category: requireString(item.categoria, "categoria") as TicketCategory,
    area: requireString(item.area, "area") as TicketArea,
    priority: requireString(item.prioridad, "prioridad") as TicketPriority,
    description: requireString(item.descripcion, "descripcion"),
    status: requireString(item.estado, "estado") as TicketStatus,
    responsible: requireString(item.responsable, "responsable"),
    createdAt: requireString(item.created_at, "created_at"),
    dueAt: requireString(item.fecha_limite, "fecha_limite"),
    slaLabel: requireString(item.sla_etiqueta, "sla_etiqueta"),
    requester: {
      name: item.solicitante?.nombre ?? "",
      email: item.solicitante?.correo ?? "",
      area: item.solicitante?.area ?? "",
      userId: item.solicitante?.user_id ?? "",
    },
    attachments: Array.isArray(item.adjuntos) ? item.adjuntos.map(mapAttachment) : [],
  };
}

function mapAttachment(raw: RawAttachment): AttachmentMetadata {
  return {
    id: raw.id,
    name: raw.name,
    size: raw.size,
    type: raw.type,
    downloadUrl: raw.download_url,
  };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`Invalid ticket item from API: field "${field}" is missing or not a string`);
  }
  return value;
}
