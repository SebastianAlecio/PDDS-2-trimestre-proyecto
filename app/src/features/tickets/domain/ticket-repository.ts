import type { CreateTicketInput, Ticket } from "./ticket";

export type QueueData = {
  unassigned: Ticket[];
  mine: Ticket[];
  historial: Ticket[];
  // Tickets escalados a cola N2 sin tomar por un N2 todavía. Solo se popula
  // cuando el caller es agente-n2 (otros roles reciben []).
  escalated: Ticket[];
  // Tickets que el caller (agente-n1) escaló a la cola N2 — se mantienen
  // visibles en su panel para que el N1 vea qué pasó con sus casos. Vacío
  // para n2 y gerente.
  escalated_by_me: Ticket[];
};

// Entrada del historial de agentes que pasaron por un ticket.
export type HistorialAgente = {
  nivel: "N1" | "N2";
  sub: string;
  nombre: string;
  asignado_at: string | null;
  escalado_at?: string;
  cerrado_at?: string;
  razon?: string;
};

// Evento del timeline del ticket.
export type TicketEvent = {
  tipo: "asignado" | "escalado" | "cerrado" | "vencido";
  actor_sub: string;
  actor_nombre: string;
  actor_nivel?: "N1" | "N2";
  created_at: string;
  razon?: string;
  escalado_a?: string;
};

export type TicketHistory = {
  ticket_id: string;
  nivel_actual: "N1" | "N2";
  historial_agentes: HistorialAgente[];
  events: TicketEvent[];
};

// Metricas agregadas por agente para el dashboard del gerente.
export type AgentMetrics = {
  sub: string;
  nombre: string;
  tickets_resueltos: number;
  tickets_vencidos: number;
  tickets_en_progreso: number;
  tiempo_promedio_resolucion_min: number | null;
};

export type AgentMetricsResponse = {
  totals: {
    tickets_totales: number;
    abiertos: number;
    en_progreso: number;
    cerrados: number;
    vencidos: number;
    escalados_a_n2: number;
  };
  agents: AgentMetrics[];
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
  escalateTicket(ticketId: string, razon: string): Promise<Ticket>;
  listHistory(ticketId: string): Promise<TicketHistory>;
  listAgentMetrics(): Promise<AgentMetricsResponse>;
}
