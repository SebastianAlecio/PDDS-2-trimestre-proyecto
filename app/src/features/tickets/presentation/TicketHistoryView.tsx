import { useCallback, useEffect, useMemo, useState } from "react";
import { HttpError } from "../../../shared/api/http-client";
import type {
  HistorialAgente,
  TicketEvent,
  TicketHistory,
} from "../domain/ticket-repository";
import { HttpTicketRepository } from "../infrastructure/http-ticket-repository";
import styles from "./TicketHistoryView.module.css";

// Vista compartida del historial de un ticket. Se monta como section
// colapsable dentro de las pages por-ticket (colaborador / agente). El
// fetch se difiere hasta que el usuario expande la sección — el endpoint
// /tickets/{id}/history hace queries adicionales y no queremos pagar ese
// costo si nadie lo va a ver.
//
// Props:
//   ticketId           — qué ticket cargar (required).
//   ticketCreatedAt    — para inyectar un primer evento sintético "creado por X".
//                        Opcional: si falta, no se muestra (no es destructivo).
//   ticketRequesterName — nombre a mostrar en el evento de creación.

const repository = new HttpTicketRepository();

type Props = {
  ticketId: string;
  ticketCreatedAt?: string;
  ticketRequesterName?: string;
};

type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; data: TicketHistory }
  | { kind: "error"; message: string };

export function TicketHistoryView({
  ticketId,
  ticketCreatedAt,
  ticketRequesterName,
}: Props) {
  const [open, setOpen] = useState(false);
  const [fetchState, setFetchState] = useState<FetchState>({ kind: "idle" });

  const load = useCallback(async () => {
    setFetchState({ kind: "loading" });
    try {
      const data = await repository.listHistory(ticketId);
      setFetchState({ kind: "ready", data });
    } catch (err) {
      setFetchState({ kind: "error", message: humanize(err) });
    }
  }, [ticketId]);

  // Fetch al expandir por primera vez (o si quedó en error y reintentamos).
  useEffect(() => {
    if (!open) return;
    if (fetchState.kind === "idle") void load();
  }, [open, fetchState.kind, load]);

  return (
    <section className={styles.section}>
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className={styles.toggleLabel}>
          <span
            className={`${styles.caret} ${open ? styles.caretOpen : ""}`}
            aria-hidden="true"
          >
            ▶
          </span>
          Historial del ticket
        </span>
      </button>

      {open && fetchState.kind === "loading" && (
        <p className={styles.note}>Cargando historial…</p>
      )}

      {open && fetchState.kind === "error" && (
        <p className={styles.errorBox} role="alert">
          {fetchState.message}
          <button
            type="button"
            className={styles.retryBtn}
            onClick={() => void load()}
          >
            Reintentar
          </button>
        </p>
      )}

      {open && fetchState.kind === "ready" && (
        <HistoryBody
          data={fetchState.data}
          ticketCreatedAt={ticketCreatedAt}
          ticketRequesterName={ticketRequesterName}
        />
      )}
    </section>
  );
}

function HistoryBody({
  data,
  ticketCreatedAt,
  ticketRequesterName,
}: {
  data: TicketHistory;
  ticketCreatedAt?: string;
  ticketRequesterName?: string;
}) {
  // Items del timeline: evento sintético "creado por X" (si tenemos la
  // info) + eventos del backend ordenados por created_at asc.
  type TimelineItem =
    | { kind: "created"; createdAt: string; requesterName: string }
    | { kind: "event"; event: TicketEvent };

  const items = useMemo<TimelineItem[]>(() => {
    const list: TimelineItem[] = [];
    if (ticketCreatedAt && ticketRequesterName) {
      list.push({
        kind: "created",
        createdAt: ticketCreatedAt,
        requesterName: ticketRequesterName,
      });
    }
    const sorted = [...data.events].sort((a, b) => {
      const ta = Date.parse(a.created_at);
      const tb = Date.parse(b.created_at);
      const va = Number.isNaN(ta) ? Number.POSITIVE_INFINITY : ta;
      const vb = Number.isNaN(tb) ? Number.POSITIVE_INFINITY : tb;
      return va - vb;
    });
    for (const ev of sorted) list.push({ kind: "event", event: ev });
    return list;
  }, [data.events, ticketCreatedAt, ticketRequesterName]);

  if (items.length === 0) {
    return <p className={styles.note}>Aún no hay eventos para este ticket.</p>;
  }

  return (
    <div>
      <ol className={styles.timeline}>
        {items.map((item, idx) => {
          if (item.kind === "created") {
            return (
              <li key={`created-${idx}`} className={styles.event}>
                <span className={`${styles.dot} ${styles.dotCreated}`} />
                <div className={styles.eventHead}>
                  <span className={styles.eventTitle}>
                    Ticket creado por {item.requesterName}
                  </span>
                  <span className={styles.eventTime}>
                    {formatDateTime(item.createdAt)}
                  </span>
                </div>
              </li>
            );
          }
          return (
            <EventRow key={`ev-${idx}-${item.event.created_at}`} event={item.event} />
          );
        })}
      </ol>

      {data.historial_agentes.length > 0 && (
        <div className={styles.agentsBlock}>
          <p className={styles.agentsTitle}>
            Agentes que pasaron por este ticket
          </p>
          <ul className={styles.agentsList}>
            {data.historial_agentes.map((a, idx) => (
              <AgentRow key={`${a.sub}-${idx}`} agent={a} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function EventRow({ event }: { event: TicketEvent }) {
  const { dotClass, icon, title } = describeEvent(event);
  return (
    <li className={styles.event}>
      <span className={`${styles.dot} ${dotClass}`} />
      <div className={styles.eventHead}>
        <span className={styles.eventTitle}>
          <span aria-hidden="true" style={{ marginRight: 6 }}>{icon}</span>
          {title}
          {event.actor_nivel && (
            <span className={styles.eventBadge}>{event.actor_nivel}</span>
          )}
        </span>
        <span className={styles.eventTime}>{formatDateTime(event.created_at)}</span>
      </div>
      {event.escalado_a && (
        <p className={styles.eventMeta}>
          Escalado a: <strong>{event.escalado_a}</strong>
        </p>
      )}
      {event.razon && <p className={styles.eventReason}>“{event.razon}”</p>}
    </li>
  );
}

function describeEvent(event: TicketEvent): {
  dotClass: string;
  icon: string;
  title: string;
} {
  switch (event.tipo) {
    case "asignado":
      return {
        dotClass: styles.dotAsignado ?? "",
        icon: "👤",
        title: `Asignado a ${event.actor_nombre}`,
      };
    case "escalado":
      return {
        dotClass: styles.dotEscalado ?? "",
        icon: "⬆",
        title: `Escalado por ${event.actor_nombre}`,
      };
    case "cerrado":
      return {
        dotClass: styles.dotCerrado ?? "",
        icon: "✓",
        title: `Cerrado por ${event.actor_nombre}`,
      };
    case "vencido":
      return {
        dotClass: styles.dotVencido ?? "",
        icon: "⏰",
        title: "SLA vencido",
      };
    default:
      return {
        dotClass: "",
        icon: "•",
        title: event.actor_nombre || "Evento",
      };
  }
}

function AgentRow({ agent }: { agent: HistorialAgente }) {
  // Rango de tenencia del agente: desde "asignado_at" hasta su salida
  // (escalado_at o cerrado_at). Si todavía es el actual, "hasta ahora".
  const start = agent.asignado_at ? formatDateTime(agent.asignado_at) : "—";
  const endIso = agent.cerrado_at ?? agent.escalado_at ?? null;
  const end = endIso ? formatDateTime(endIso) : "ahora";
  return (
    <li className={styles.agentRow}>
      <span className={styles.agentName}>{agent.nombre}</span>
      <span className={styles.eventBadge}>{agent.nivel}</span>
      <span className={styles.agentMeta}>
        {start} → {end}
      </span>
      {agent.razon && (
        <span className={styles.agentMeta} title={agent.razon}>
          · razón: {truncate(agent.razon, 60)}
        </span>
      )}
    </li>
  );
}

function formatDateTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function humanize(err: unknown): string {
  if (err instanceof HttpError) {
    if (err.status === 401) return "Tu sesión expiró. Vuelve a iniciar sesión.";
    if (err.status === 403) return "No tienes acceso al historial de este ticket.";
    if (err.status === 404) return "Este ticket ya no existe.";
    return `Error del servidor (${err.status}): ${err.message}`;
  }
  if (err instanceof Error) return err.message;
  return "Error inesperado al cargar el historial.";
}
