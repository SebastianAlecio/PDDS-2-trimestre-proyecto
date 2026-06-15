import { Link } from "react-router-dom";
import { AppHeader } from "../../../shared/ui/AppHeader";
import type {
  Ticket,
  TicketPriority,
  TicketStatus,
} from "../domain/ticket";
import { useQueue } from "./use-queue";
import { shortId } from "./use-create-ticket";
import styles from "./QueuePage.module.css";

// Historial de tickets cerrados o resueltos asignados al agente. Datos
// vienen del mismo endpoint /tickets/queue que la cola activa — el
// backend ya separa mine vs historial.
export function AgentHistoryPage() {
  const { state, reload } = useQueue();

  const historial =
    state.kind === "ready" ? state.data.historial : [];
  const total = historial.length;

  return (
    <div className={styles.shell}>
      <AppHeader />

      <main className={styles.main}>
        <section className={styles.hero}>
          <p className={styles.heroEyebrow}>Soporte</p>
          <h1 className={styles.heroTitle}>Historial</h1>
          <p className={styles.heroLead}>
            Tickets que ya cerraste. Click en cualquiera para revisar la
            conversación archivada.
          </p>

          <div className={styles.metaRow}>
            <div className={styles.metaCard}>
              <span className={styles.metaKey}>Cerrados</span>
              <span className={styles.metaValue}>{total}</span>
            </div>
          </div>

          <div className={styles.headerRow}>
            <Link to="/cola" className={styles.refresh} style={{ textDecoration: "none" }}>
              ← Volver a la cola
            </Link>
            <button
              type="button"
              className={styles.refresh}
              onClick={() => void reload()}
              disabled={state.kind === "loading"}
            >
              {state.kind === "loading" ? "Cargando…" : "Actualizar"}
            </button>
          </div>
        </section>

        <div className={styles.content}>
          {state.kind === "error" && (
            <p className={styles.errorBox} role="alert">
              {state.message}
            </p>
          )}

          {state.kind === "loading" && (
            <p className={styles.note}>Cargando historial…</p>
          )}

          {state.kind === "ready" && (
            <HistoryTable tickets={historial} />
          )}
        </div>
      </main>
    </div>
  );
}

function HistoryTable({ tickets }: { tickets: Ticket[] }) {
  return (
    <article className={styles.card}>
      <header className={styles.cardHeader}>
        <span className={styles.cardTitle}>Cerrados</span>
        <span className={styles.cardMeta}>{tickets.length} totales</span>
      </header>

      {tickets.length === 0 ? (
        <p className={styles.note}>
          <span className={styles.noteStrong}>Sin tickets cerrados todavía.</span>
          Cuando cierres uno aparecerá acá.
        </p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th style={{ width: 120 }}>ID</th>
              <th>Título</th>
              <th style={{ width: 110 }}>Área</th>
              <th style={{ width: 110 }}>Prioridad</th>
              <th style={{ width: 160 }}>Estado</th>
              <th style={{ width: 140 }}>Solicitante</th>
              <th style={{ width: 140 }}>Cerrado</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => (
              <tr key={t.id}>
                <td className={styles.idCell}>
                  <Link to={`/agente/ticket/${t.id}`} className={styles.ticketLink}>
                    {shortId(t.id)}
                  </Link>
                </td>
                <td>
                  <Link to={`/agente/ticket/${t.id}`} className={styles.titleCellLink}>
                    <div className={styles.titleCell}>
                      <span className={styles.titleMain}>{t.title}</span>
                      <span className={styles.titleMeta}>
                        {capitalize(t.category)}
                      </span>
                    </div>
                  </Link>
                </td>
                <td className={styles.cellMuted}>{t.area}</td>
                <td>
                  <PriorityTag priority={t.priority} />
                </td>
                <td>
                  <StatusTag status={t.status} />
                </td>
                <td className={styles.cellMuted}>{t.requester.name}</td>
                <td className={styles.cellMuted}>{formatDate(t.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </article>
  );
}

function PriorityTag({ priority }: { priority: TicketPriority }) {
  const cls =
    priority === "alta"
      ? (styles.prioHigh ?? "")
      : priority === "media"
        ? (styles.prioMid ?? "")
        : (styles.prioLow ?? "");
  return (
    <span className={`${styles.tag} ${cls}`}>
      <span className={styles.dot} />
      {capitalize(priority)}
    </span>
  );
}

function StatusTag({ status }: { status: TicketStatus }) {
  return (
    <span className={`${styles.tag} ${styles.stateDone ?? ""}`}>
      <span className={styles.dot} />
      {status}
    </span>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-ES", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
