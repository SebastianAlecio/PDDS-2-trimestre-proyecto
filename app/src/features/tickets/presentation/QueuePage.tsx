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

export function QueuePage() {
  const { state, assignState, reload, assign } = useQueue();

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
            Toma los tickets sin asignar para empezar a trabajarlos. Tu lista
            personal muestra todo lo que aún no resuelves.
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
                showTakeButton
                onTake={(id) => void assign(id)}
                assignState={assignState}
              />

              <QueueSection
                title="Asignados a ti"
                meta={`${state.data.mine.length} activos`}
                tickets={state.data.mine}
                emptyTitle="Aún no tomaste ningún ticket."
                emptyBody="Cuando tomes uno de la lista de arriba, aparecerá aquí."
                showTakeButton={false}
                assignState={assignState}
              />
            </>
          )}
        </div>
      </main>

    </div>
  );
}

type AssignState =
  | { kind: "idle" }
  | { kind: "pending"; ticketId: string }
  | { kind: "error"; ticketId: string; message: string };

function QueueSection({
  title,
  meta,
  tickets,
  emptyTitle,
  emptyBody,
  showTakeButton,
  onTake,
  assignState,
}: {
  title: string;
  meta: string;
  tickets: Ticket[];
  emptyTitle: string;
  emptyBody: string;
  showTakeButton: boolean;
  onTake?: (ticketId: string) => void;
  assignState: AssignState;
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
              {showTakeButton && (
                <th style={{ width: 130 }} className={styles.actionCell}>
                  Acción
                </th>
              )}
              {!showTakeButton && (
                <th style={{ width: 140 }}>Responsable</th>
              )}
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => {
              const isAssignPending =
                assignState.kind === "pending" && assignState.ticketId === t.id;
              const assignErrorMsg =
                assignState.kind === "error" && assignState.ticketId === t.id
                  ? assignState.message
                  : null;
              return (
                <tr key={t.id}>
                  <td className={styles.idCell}>
                    {showTakeButton ? (
                      shortId(t.id)
                    ) : (
                      <Link to={`/agente/ticket/${t.id}`} className={styles.ticketLink}>
                        {shortId(t.id)}
                      </Link>
                    )}
                  </td>
                  <td>
                    <div className={styles.titleCell}>
                      <span className={styles.titleMain}>{t.title}</span>
                      <span className={styles.titleMeta}>
                        {capitalize(t.category)} · creado{" "}
                        {formatDate(t.createdAt)}
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
                  <td className={styles.cellMuted}>{t.requester.name}</td>
                  {showTakeButton && (
                    <td className={styles.actionCell}>
                      <button
                        type="button"
                        className={styles.takeBtn}
                        onClick={() => onTake?.(t.id)}
                        disabled={isAssignPending}
                      >
                        {isAssignPending ? "Tomando…" : "Tomar ticket"}
                      </button>
                      {assignErrorMsg && (
                        <p className={styles.inlineError} role="alert">
                          {assignErrorMsg}
                        </p>
                      )}
                    </td>
                  )}
                  {!showTakeButton && (
                    <td className={styles.cellMuted}>{t.responsible}</td>
                  )}
                </tr>
              );
            })}
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
