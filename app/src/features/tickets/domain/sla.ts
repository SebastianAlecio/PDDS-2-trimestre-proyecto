import type { TicketPriority } from "./ticket";

type SlaSpec = { hours: number; label: string };

const SLA_BY_PRIORITY: Record<TicketPriority, SlaSpec> = {
  alta: { hours: 1, label: "1 hora hábil" },
  media: { hours: 4, label: "4 horas hábiles" },
  baja: { hours: 24, label: "1 día hábil" },
};

// TODO(business-calendar): el watchdog server-side debe descontar fines de
// semana y feriados. Aquí usamos horas calendario para mostrar el due-at
// como hint visual al crear el ticket; el cumplimiento real lo evalúa el
// backend cuando exista.
export function deriveSla(
  priority: TicketPriority,
  createdAt: Date,
): { label: string; dueAt: Date; hours: number } {
  const { hours, label } = SLA_BY_PRIORITY[priority];
  const dueAt = new Date(createdAt.getTime() + hours * 60 * 60 * 1000);
  return { label, dueAt, hours };
}
