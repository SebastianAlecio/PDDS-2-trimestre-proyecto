import { Link } from "react-router-dom";
import { AppHeader } from "../../../shared/ui/AppHeader";
import type {
  TicketPriority,
  TicketStatus,
} from "../domain/ticket";
import { useMyTickets } from "./use-my-tickets";
import { shortId } from "./use-create-ticket";
import styles from "./MyTicketsPage.module.css";

export function MyTicketsPage() {
  const { state, reload } = useMyTickets();

  return (
    <div className={styles.shell}>
      <AppHeader />

      <main className={styles.main}>
        <section className={styles.hero}>
          <p className={styles.heroEyebrow}>Tu actividad</p>
          <h1 className={styles.heroTitle}>Mis tickets</h1>
          <p className={styles.heroLead}>
            Estos son los tickets que creaste, ordenados del más reciente al más
            antiguo. El estado se actualiza cuando un agente los toma o resuelve.
          </p>
          <div className={styles.headerRow}>
            <Link to="/crear" className="btn-primary" style={{ textDecoration: "none" }}>
              Crear nuevo ticket
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
          <article className={styles.card}>
            <header className={styles.cardHeader}>
              <span className={styles.cardTitle}>Tickets activos</span>
              <span className={styles.cardMeta}>
                {state.kind === "ready"
                  ? `${state.tickets.length} totales`
                  : state.kind === "loading"
                    ? "cargando…"
                    : ""}
              </span>
            </header>

            {state.kind === "error" && (
              <p className={styles.errorBox} role="alert">
                {state.message}
              </p>
            )}

            {state.kind === "loading" && (
              <p className={styles.note}>Cargando tus tickets…</p>
            )}

            {state.kind === "ready" && state.tickets.length === 0 && (
              <p className={styles.note}>
                <span className={styles.noteStrong}>Sin tickets todavía.</span>
                Cuando crees uno, aparecerá aquí.
              </p>
            )}

            {state.kind === "ready" && state.tickets.length > 0 && (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th style={{ width: 120 }}>ID</th>
                    <th>Título</th>
                    <th style={{ width: 120 }}>Área</th>
                    <th style={{ width: 100 }}>Prioridad</th>
                    <th style={{ width: 160 }}>Estado</th>
                    <th style={{ width: 140 }}>Responsable</th>
                    <th style={{ width: 140 }}>Creado</th>
                  </tr>
                </thead>
                <tbody>
                  {state.tickets.map((t) => (
                    <tr key={t.id}>
                      <td className={styles.idCell}>{shortId(t.id)}</td>
                      <td>
                        <div className={styles.titleCell}>
                          <span className={styles.titleMain}>{t.title}</span>
                          <span className={styles.titleMeta}>
                            {capitalize(t.category)}
                          </span>
                        </div>
                      </td>
                      <td className={styles.cellMuted}>{t.area}</td>
                      <td>
                        <PriorityTag priority={t.priority} />
                      </td>
                      <td>
                        <StatusTag status={t.status} />
                      </td>
                      <td className={styles.cellMuted}>{t.responsible}</td>
                      <td className={styles.cellMuted}>{formatDate(t.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </article>
        </div>
      </main>
    </div>
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
  const cls = classForStatus(status);
  return (
    <span className={`${styles.tag} ${cls}`}>
      <span className={styles.dot} />
      {status}
    </span>
  );
}

function classForStatus(status: TicketStatus): string {
  switch (status) {
    case "Abierto":
      return styles.stateOpen ?? "";
    case "En progreso":
      return styles.stateProgress ?? "";
    case "Esperando colaborador":
      return styles.stateWaiting ?? "";
    case "Resuelto":
    case "Cerrado":
      return styles.stateDone ?? "";
    case "Vencido":
      return styles.stateOverdue ?? "";
    default:
      return styles.stateOpen ?? "";
  }
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
