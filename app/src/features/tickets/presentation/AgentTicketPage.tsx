import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AppHeader } from "../../../shared/ui/AppHeader";
import { useAuth } from "../../../shared/auth/use-auth";
import { ChatPane } from "../../chat/presentation/ChatPane";
import { useChat } from "../../chat/presentation/use-chat";
import { CloseTicketConfirmModal } from "./CloseTicketConfirmModal";
import { EscalateTicketModal } from "./EscalateTicketModal";
import { TicketAttachmentsView } from "./TicketAttachmentsView";
import { TicketHistoryView } from "./TicketHistoryView";
import { useAgentTicket } from "./use-agent-ticket";
import { shortId } from "./use-create-ticket";
import styles from "./AgentTicketPage.module.css";

export function AgentTicketPage() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { status } = useAuth();

  const ticketId = params.id ?? null;
  const {
    state,
    assignState,
    closeState,
    escalateState,
    assign,
    close,
    escalate,
  } = useAgentTicket(ticketId);

  // Cargamos history (REST) + WS para todos los tickets donde soy el
  // agente asignado, incluso si están cerrados — queremos ver el chat
  // archivado. El closedNotice (derivado abajo) bloquea el input cuando
  // corresponde, así que la conexión WS extra es benigna.
  const isClosed = state.kind === "ready" && state.ticket.status === "Cerrado";
  const canChat = state.kind === "ready" && state.isAssignedToMe;
  const chat = useChat(canChat ? ticketId : null);

  // closedNotice combinado: persistente desde el status (sobrevive re-mounts)
  // o efímero desde el evento WS broadcast.
  const closedNotice =
    state.kind === "ready" && isClosed
      ? { closedByName: state.ticket.responsible, closedAt: "" }
      : chat.ticketClosed
        ? {
            closedByName: chat.ticketClosed.closedByName,
            closedAt: chat.ticketClosed.closedAt,
          }
        : null;

  const [confirmingClose, setConfirmingClose] = useState(false);
  const [confirmingEscalate, setConfirmingEscalate] = useState(false);

  const viewerSub =
    status.state === "signed-in" ? status.user.username : "";

  // Solo agentes N1 escalan. N2 ya es el último nivel; el gerente no opera
  // tickets. Y solo aplica sobre tickets que el N1 tomó y que están vivos
  // (Abierto o En progreso) — un ticket cerrado o vencido no se escala.
  const viewerRole =
    status.state === "signed-in" ? status.user.primaryRole : null;
  const canEscalate =
    state.kind === "ready" &&
    viewerRole === "agente-n1" &&
    state.isAssignedToMe &&
    (state.ticket.status === "Abierto" ||
      state.ticket.status === "En progreso");

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
              No encontramos el ticket en la cola. Puede que ya esté cerrado o
              que pertenezca a un agente distinto.
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
                  <TicketAttachmentsView attachments={state.ticket.attachments} />
                </section>
              )}

              <TicketHistoryView
                ticketId={state.ticket.id}
                ticketCreatedAt={state.ticket.createdAt}
                ticketRequesterName={state.ticket.requester.name}
              />

              <div className={styles.actions}>
                {state.ticket.status === "Cerrado" ? (
                  <button
                    type="button"
                    className={styles.backToQueueBtn}
                    onClick={() => navigate("/cola")}
                  >
                    Volver a la cola
                  </button>
                ) : state.isAssignedToMe ? (
                  <div className={styles.actionsRow}>
                    {canEscalate && (
                      <button
                        type="button"
                        className={styles.escalateBtn}
                        onClick={() => setConfirmingEscalate(true)}
                        disabled={
                          escalateState.kind === "pending" ||
                          closeState.kind === "pending"
                        }
                      >
                        {escalateState.kind === "pending"
                          ? "Escalando…"
                          : "Escalar a N2"}
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.closeBtn}
                      onClick={() => setConfirmingClose(true)}
                      disabled={
                        closeState.kind === "pending" ||
                        escalateState.kind === "pending"
                      }
                    >
                      {closeState.kind === "pending"
                        ? "Cerrando…"
                        : "Cerrar ticket"}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={styles.takeBtn}
                    onClick={() => void assign()}
                    disabled={assignState.kind === "pending"}
                  >
                    {assignState.kind === "pending" ? "Tomando…" : "Tomar ticket"}
                  </button>
                )}
                {assignState.kind === "error" && (
                  <p className={styles.inlineError} role="alert">
                    {assignState.message}
                  </p>
                )}
                {closeState.kind === "error" && (
                  <p className={styles.inlineError} role="alert">
                    {closeState.message}
                  </p>
                )}
                {escalateState.kind === "error" && (
                  <p className={styles.inlineError} role="alert">
                    {escalateState.message}
                  </p>
                )}
              </div>
            </section>

            <section className={styles.chatCol}>
              {state.isAssignedToMe ? (
                <ChatPane
                  viewerSub={viewerSub}
                  messages={chat.messages}
                  systemMessages={chat.systemMessages}
                  connectionState={chat.connectionState}
                  sendState={chat.sendState}
                  historyLoading={chat.historyState.kind === "loading"}
                  historyError={
                    chat.historyState.kind === "error" ? chat.historyState.message : null
                  }
                  closedNotice={closedNotice}
                  onSend={chat.send}
                  onDismissSendError={chat.dismissSendError}
                />
              ) : (
                <UntakenCard />
              )}
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

      {state.kind === "ready" && confirmingEscalate && (
        <EscalateTicketModal
          ticket={state.ticket}
          isEscalating={escalateState.kind === "pending"}
          onCancel={() => setConfirmingEscalate(false)}
          onConfirm={async (razon) => {
            await escalate(razon);
            setConfirmingEscalate(false);
            // Tras escalar el ticket ya no pertenece al N1 — sacamos al
            // agente del panel para evitar acciones sobre datos stale.
            navigate("/cola");
          }}
        />
      )}
    </div>
  );
}

function UntakenCard() {
  return (
    <div className={styles.waitingCard}>
      <span className={styles.waitingIcon}>📥</span>
      <h3>Tickets sin tomar</h3>
      <p>
        Para chatear con el solicitante, primero toma el ticket con el botón
        a la izquierda. Una vez asignado, podrás ver el historial del chat y
        enviar mensajes.
      </p>
    </div>
  );
}
