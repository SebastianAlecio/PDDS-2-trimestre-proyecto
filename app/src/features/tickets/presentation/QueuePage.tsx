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

// Cola del agente. Cada fila linkea al panel del ticket (/agente/ticket/:id)
// — desde el panel el agente toma el ticket, chatea y lo cierra. Sin
// acciones inline en la tabla para unificar el flujo "click → ver panel".
export function QueuePage() {
  const { state, reload } = useQueue();

  const unassignedCount =
    state.kind === "ready" ? state.data.unassigned.length : 0;
  const mineCount = state.kind === "ready" ? state.data.mine.length : 0;

  return (
    <div className={styles.shell}>
      <AppHeader />

      <main className={styles.main}>
        <section className={styles.hero}>
          <p className={styles.heroEyebrow}>Soporte</p>
          <h1 className={styles.heroTitle}>Cola del agente</h1>
          <p className={styles.heroLead}>
            Click en cualquier ticket para abrir su panel: ahí podes tomarlo,
            chatear con el solicitante y cerrarlo cuando lo resuelvas.
          </p>

          <div className={styles.metaRow}>
            <div className={styles.metaCard}>
              <span className={styles.metaKey}>Sin asignar</span>
              <span className={styles.metaValue}>{unassignedCount}</span>
            </div>
            <div className={styles.metaCard}>
              <span className={styles.metaKey}>Asignados a ti</span>
              <span className={styles.metaValue}>{mineCount}</span>
            </div>
          </div>

          <div className={styles.headerRow}>
            <button
              type="button"
              className={styles.refresh}
              onClick={() => void reload()}
              disabled={state.kind === "loading"}
            >
              {state.kind === "loading" ? "Cargando…" : "Actualizar"}
            </button>
            <Link to="/agente/historial" className={styles.refresh} style={{ textDecoration: "none" }}>
              Ver historial →
            </Link>
          </div>
        </section>

        <div className={styles.content}>
          {state.kind === "error" && (
            <p className={styles.errorBox} role="alert">
              {state.message}
            </p>
          )}

          {state.kind === "loading" && (
            <p className={styles.note}>Cargando la cola…</p>
          )}

          {state.kind === "ready" && (
            <>
              <QueueSection
                title="Sin asignar"
                meta={`${state.data.unassigned.length} disponibles`}
                tickets={state.data.unassigned}
                emptyTitle="No hay tickets sin asignar."
                emptyBody="Cuando un colaborador cree uno, aparecerá aquí para que lo tomes."
                showResponsible={false}
              />

              <QueueSection
                title="Asignados a ti"
                meta={`${state.data.mine.length} activos`}
                tickets={state.data.mine}
                emptyTitle="Aún no tomaste ningún ticket."
                emptyBody="Toma uno de la lista de arriba y aparecerá aquí."
                showResponsible
              />
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function QueueSection({
  title,
  meta,
  tickets,
  emptyTitle,
  emptyBody,
  showResponsible,
}: {
  title: string;
  meta: string;
  tickets: Ticket[];
  emptyTitle: string;
  emptyBody: string;
  showResponsible: boolean;
}) {
  return (
    <article className={styles.card}>
      <header className={styles.cardHeader}>
        <span className={styles.cardTitle}>{title}</span>
        <span className={styles.cardMeta}>{meta}</span>
      </header>

      {tickets.length === 0 ? (
        <p className={styles.note}>
          <span className={styles.noteStrong}>{emptyTitle}</span>
          {emptyBody}
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
              {showResponsible && (
                <th style={{ width: 140 }}>Responsable</th>
              )}
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
                        {capitalize(t.category)} · creado{" "}
                        {formatDate(t.createdAt)}
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
                {showResponsible && (
                  <td className={styles.cellMuted}>{t.responsible}</td>
                )}
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
