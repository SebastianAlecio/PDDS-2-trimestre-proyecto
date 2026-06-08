import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AppHeader } from "../../../shared/ui/AppHeader";
import { useAuth } from "../../../shared/auth/use-auth";
import { ChatPane } from "../../chat/presentation/ChatPane";
import { useChat } from "../../chat/presentation/use-chat";
import { CloseTicketConfirmModal } from "./CloseTicketConfirmModal";
import { useAgentTicket } from "./use-agent-ticket";
import { shortId } from "./use-create-ticket";
import styles from "./AgentTicketPage.module.css";

export function AgentTicketPage() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { status } = useAuth();

  const ticketId = params.id ?? null;
  const { state, closeState, close } = useAgentTicket(ticketId);
  const chat = useChat(ticketId);

  const [confirmingClose, setConfirmingClose] = useState(false);

  const viewerSub =
    status.state === "signed-in" ? status.user.username : "";

  return (
    <div className={styles.shell}>
      <AppHeader />
      <main className={styles.main}>
        <div className={styles.backRow}>
          <Link to="/cola" className={styles.backLink}>
            ← Volver a la cola
          </Link>
        </div>

        {state.kind === "loading" && (
          <p className={styles.note}>Cargando ticket…</p>
        )}

        {state.kind === "error" && (
          <p className={styles.errorBox} role="alert">
            {state.message}
          </p>
        )}

        {state.kind === "not-found" && (
          <div className={styles.notFound}>
            <h2>Ticket no disponible</h2>
            <p>
              El ticket no está en tu cola. Puede que aún no lo hayas tomado,
              que ya esté cerrado, o que pertenezca a otro agente.
            </p>
          </div>
        )}

        {state.kind === "ready" && (
          <div className={styles.layout}>
            <section className={styles.detailsCol}>
              <header className={styles.detailsHeader}>
                <div>
                  <p className={styles.ticketId}>
                    {shortId(state.ticket.id)}
                  </p>
                  <h1 className={styles.ticketTitle}>{state.ticket.title}</h1>
                </div>
                <span
                  className={`${styles.statusTag} ${state.ticket.status === "Cerrado" ? styles.statusClosed : styles.statusOpen}`}
                >
                  {state.ticket.status}
                </span>
              </header>

              <dl className={styles.metaGrid}>
                <div className={styles.metaItem}>
                  <dt>Categoría</dt>
                  <dd>{state.ticket.category}</dd>
                </div>
                <div className={styles.metaItem}>
                  <dt>Área</dt>
                  <dd>{state.ticket.area}</dd>
                </div>
                <div className={styles.metaItem}>
                  <dt>Prioridad</dt>
                  <dd>{state.ticket.priority}</dd>
                </div>
                <div className={styles.metaItem}>
                  <dt>SLA</dt>
                  <dd>{state.ticket.slaLabel}</dd>
                </div>
                <div className={styles.metaItem}>
                  <dt>Solicitante</dt>
                  <dd>
                    {state.ticket.requester.name}
                    <br />
                    <small>{state.ticket.requester.email}</small>
                  </dd>
                </div>
                <div className={styles.metaItem}>
                  <dt>Responsable</dt>
                  <dd>{state.ticket.responsible}</dd>
                </div>
              </dl>

              <section className={styles.description}>
                <h3>Descripción</h3>
                <p>{state.ticket.description}</p>
              </section>

              {state.ticket.attachments.length > 0 && (
                <section className={styles.description}>
                  <h3>Adjuntos del ticket</h3>
                  <ul className={styles.attachList}>
                    {state.ticket.attachments.map((a) => (
                      <li key={a.id}>
                        {a.name}
                        <small> · {a.type}</small>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <div className={styles.actions}>
                {state.ticket.status !== "Cerrado" ? (
                  <button
                    type="button"
                    className={styles.closeBtn}
                    onClick={() => setConfirmingClose(true)}
                    disabled={closeState.kind === "pending"}
                  >
                    {closeState.kind === "pending" ? "Cerrando…" : "Cerrar ticket"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.backToQueueBtn}
                    onClick={() => navigate("/cola")}
                  >
                    Volver a la cola
                  </button>
                )}
                {closeState.kind === "error" && (
                  <p className={styles.inlineError} role="alert">
                    {closeState.message}
                  </p>
                )}
              </div>
            </section>

            <section className={styles.chatCol}>
              <ChatPane
                viewerSub={viewerSub}
                messages={chat.messages}
                connectionState={chat.connectionState}
                sendState={chat.sendState}
                historyLoading={chat.historyState.kind === "loading"}
                historyError={
                  chat.historyState.kind === "error" ? chat.historyState.message : null
                }
                closedNotice={
                  chat.ticketClosed
                    ? {
                        closedByName: chat.ticketClosed.closedByName,
                        closedAt: chat.ticketClosed.closedAt,
                      }
                    : null
                }
                onSend={chat.send}
                onDismissSendError={chat.dismissSendError}
              />
            </section>
          </div>
        )}
      </main>

      {state.kind === "ready" && confirmingClose && (
        <CloseTicketConfirmModal
          ticket={state.ticket}
          isClosing={closeState.kind === "pending"}
          onCancel={() => setConfirmingClose(false)}
          onConfirm={async () => {
            await close();
            setConfirmingClose(false);
          }}
        />
      )}
    </div>
  );
}
